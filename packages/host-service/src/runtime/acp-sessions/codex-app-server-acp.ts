/** ACP facade for Codex app-server JSON-RPC. */
import { spawn } from "node:child_process";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";
import {
	agent,
	ndJsonStream,
	PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import {
	type PermissionOption,
	type RequestPermissionRequest,
	type RequestPermissionResponse,
	type SessionConfigOption,
	type SessionUpdate,
	type StopReason,
	TOOL_SEMANTIC_META_KEY,
	type ToolKind,
} from "@superset/session-protocol";

const MIN_VERSION = [0, 143, 0];
const APPROVAL_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
]);
const QUIET_NOTIFICATIONS = new Set([
	"thread/started",
	"thread/status/changed",
	"turn/started",
	"turn/diff/updated",
	"turn/plan/updated",
	"remoteControl/status/changed",
	"mcpServer/startupStatus/updated",
	"account/rateLimits/updated",
	"serverRequest/resolved",
]);

type RpcId = string | number;
type RpcFrame = {
	id?: RpcId;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { message?: string };
};
type PendingRpc = { resolve(value: unknown): void; reject(error: Error): void };
type PermissionOptionWithValue = PermissionOption & { value: unknown };
type CodexToolCallUpdate = Extract<
	SessionUpdate,
	{ sessionUpdate: "tool_call" }
>;
type CodexReasoningEffort = {
	reasoningEffort: string;
	description: string;
};
type CodexModel = {
	id: string;
	model: string;
	displayName: string;
	description: string;
	hidden: boolean;
	isDefault: boolean;
	defaultReasoningEffort: string;
	supportedReasoningEfforts: CodexReasoningEffort[];
};

type CodexUsageUpdate = Extract<
	SessionUpdate,
	{ sessionUpdate: "usage_update" }
>;

/** Map Codex's active context size, not cumulative thread spend, to ACP usage. */
export function codexUsageUpdate(
	params: Record<string, unknown>,
): CodexUsageUpdate | null {
	const tokenUsage = params.tokenUsage;
	if (!tokenUsage || typeof tokenUsage !== "object") return null;
	const { last, modelContextWindow } = tokenUsage as {
		last?: unknown;
		modelContextWindow?: unknown;
	};
	if (!last || typeof last !== "object") return null;
	const used = (last as { totalTokens?: unknown }).totalTokens;
	if (
		typeof used !== "number" ||
		!Number.isFinite(used) ||
		used < 0 ||
		typeof modelContextWindow !== "number" ||
		!Number.isFinite(modelContextWindow) ||
		modelContextWindow <= 0
	) {
		return null;
	}
	return {
		sessionUpdate: "usage_update",
		used,
		size: modelContextWindow,
	};
}

/**
 * Codex app-server accepts per-thread config overrides, rather than ACP's
 * `mcpServers` shape. Its `mcp_servers` config supports stdio servers; omit
 * transports we cannot faithfully translate instead of inventing settings.
 */
export function codexMcpConfig(mcpServers: readonly McpServer[]):
	| {
			mcp_servers: Record<
				string,
				{ command: string; args: string[]; env: Record<string, string> }
			>;
	  }
	| undefined {
	const mcpServersConfig: Record<
		string,
		{ command: string; args: string[]; env: Record<string, string> }
	> = {};
	for (const server of mcpServers) {
		if (!("command" in server)) continue;
		mcpServersConfig[server.name] = {
			command: server.command,
			args: server.args,
			env: Object.fromEntries(
				server.env.map(({ name, value }) => [name, value]),
			),
		};
	}
	return Object.keys(mcpServersConfig).length > 0
		? { mcp_servers: mcpServersConfig }
		: undefined;
}

export function codexDecisionOptions(
	available: unknown,
): PermissionOptionWithValue[] {
	if (!Array.isArray(available)) return [];
	return available.flatMap((value) => {
		const optionId =
			typeof value === "string"
				? value
				: value && typeof value === "object"
					? Object.keys(value)[0]
					: undefined;
		if (!optionId) return [];
		const name: Record<string, string> = {
			accept: "Approve",
			acceptForSession: "Approve for session",
			decline: "Decline",
			cancel: "Stop",
			acceptWithExecpolicyAmendment: "Approve and always allow",
			applyNetworkPolicyAmendment: "Approve network access",
		};
		return [
			{
				optionId,
				name: name[optionId] ?? optionId,
				kind:
					optionId === "decline" || optionId === "cancel"
						? "reject_once"
						: "allow_once",
				value,
			},
		];
	});
}

/** Return only a decision Codex offered.  A selected reject option never falls through to accept. */
export function selectedCodexDecision(
	response: RequestPermissionResponse,
	options: PermissionOptionWithValue[],
): unknown {
	const outcome = response.outcome;
	if (outcome.outcome !== "selected") return "cancel";
	const selected = options.find(
		(option) => option.optionId === outcome.optionId,
	);
	return selected?.value ?? "cancel";
}

function versionOk(userAgent: unknown): boolean {
	const match =
		typeof userAgent === "string"
			? /\/(\d+)\.(\d+)\.(\d+)/.exec(userAgent)
			: null;
	if (!match) return false;
	for (let index = 0; index < MIN_VERSION.length; index += 1) {
		const actual = Number(match[index + 1] ?? 0);
		const minimum = MIN_VERSION[index] ?? 0;
		if (actual > minimum) return true;
		if (actual < minimum) return false;
	}
	return true;
}

function toolKind(item: Record<string, unknown>): ToolKind {
	return item.type === "fileChange"
		? "edit"
		: item.type === "webSearch"
			? "fetch"
			: "execute";
}
function codexToolSemantic(
	item: Record<string, unknown>,
): Record<string, unknown> | undefined {
	if (item.type !== "collabAgentToolCall" && item.type !== "collab_tool_call") {
		return undefined;
	}
	const tool = String(item.tool ?? "")
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.toLowerCase();
	if (tool !== "spawn_agent") return undefined;
	return {
		kind: "subagent",
		task:
			typeof item.prompt === "string"
				? item.prompt
				: String(item.agentPath ?? item.agent_path ?? item.tool ?? "Subagent"),
		agentType: typeof item.model === "string" ? item.model : null,
	};
}

export function codexToolUpdate(
	item: Record<string, unknown>,
): CodexToolCallUpdate {
	const status =
		item.status === "failed" || item.status === "declined"
			? "failed"
			: item.status === "completed"
				? "completed"
				: "in_progress";
	const command = typeof item.command === "string" ? item.command : "";
	const changes = Array.isArray(item.changes) ? item.changes : [];
	const semantic = codexToolSemantic(item);
	return {
		sessionUpdate: "tool_call",
		toolCallId: String(item.id),
		title:
			item.type === "fileChange"
				? `Edit ${changes.length} file${changes.length === 1 ? "" : "s"}`
				: command || String(item.tool ?? item.type ?? "Codex tool"),
		kind: toolKind(item),
		status,
		rawInput:
			item.type === "fileChange"
				? { changes }
				: semantic
					? {
							prompt: item.prompt,
							model: item.model,
							receiverThreadIds:
								item.receiverThreadIds ?? item.receiver_thread_ids,
							agentPath: item.agentPath ?? item.agent_path,
						}
					: { command },
		rawOutput: item.aggregatedOutput ?? item.result ?? item.agentsStates,
		...(semantic ? { _meta: { [TOOL_SEMANTIC_META_KEY]: semantic } } : {}),
	};
}

export class CodexBridge {
	private child: ReturnType<typeof spawn> | null = null;
	private pending = new Map<RpcId, PendingRpc>();
	private toolCalls = new Map<string, CodexToolCallUpdate>();
	private nextId = 1;
	private threadId: string | null = null;
	private contextCompactionItemTurnId: string | null = null;
	private turn: {
		id: string | null;
		resolve(value: { stopReason: StopReason }): void;
		reject(error: Error): void;
	} | null = null;
	private pendingCancel = false;
	private disposed = false;
	private write: ((frame: object) => void) | null = null;
	private models: CodexModel[] = [];
	private model: string | null = null;
	private reasoningEffort: string | null = null;

	constructor(
		private client: {
			notify(
				method: "session/update",
				params: { sessionId: string; update: SessionUpdate },
			): Promise<void>;
			request(
				method: "session/request_permission",
				params: RequestPermissionRequest,
			): Promise<RequestPermissionResponse>;
		},
	) {}

	private matches(params: Record<string, unknown>): boolean {
		return (
			typeof params.threadId !== "string" || params.threadId === this.threadId
		);
	}
	private fail(error: Error): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		if (this.turn) this.turn.reject(error);
		this.turn = null;
		this.write = null;
		const child = this.child;
		this.child = null;
		if (child && child.exitCode === null && child.signalCode === null)
			child.kill();
	}
	private request(method: string, params: object): Promise<unknown> {
		if (this.disposed || !this.write)
			return Promise.reject(new Error("Codex app-server is unavailable"));
		return new Promise((resolve, reject) => {
			const id = this.nextId++;
			this.pending.set(id, { resolve, reject });
			this.write?.({ jsonrpc: "2.0", id, method, params });
		});
	}
	async boot(): Promise<void> {
		const command = process.env.CODEX_APP_SERVER_COMMAND ?? "codex";
		const child = spawn(command, ["app-server", "--stdio"], {
			cwd: process.cwd(),
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child = child;
		if (!child.stdin || !child.stdout) {
			this.fail(new Error("codex app-server is missing stdio"));
			throw new Error("codex app-server is missing stdio");
		}
		this.write = (frame) => {
			if (!child.stdin?.destroyed)
				child.stdin.write(`${JSON.stringify(frame)}\n`);
		};
		child.on("error", (error) =>
			this.fail(new Error(`codex app-server error: ${error.message}`)),
		);
		child.on("exit", (code, signal) =>
			this.fail(
				new Error(
					`codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
				),
			),
		);
		child.stdin.on("error", (error) =>
			this.fail(new Error(`codex app-server stdin error: ${error.message}`)),
		);
		child.stdin.on("close", () =>
			this.fail(new Error("codex app-server stdin closed")),
		);
		let buffer = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			for (;;) {
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				this.handleLine(line);
			}
		});
		const initialized = (await this.request("initialize", {
			clientInfo: { name: "superset-host", version: "1" },
			capabilities: { experimentalApi: true },
		})) as { userAgent?: string };
		if (!versionOk(initialized.userAgent)) {
			const error = new Error(
				`Unsupported Codex app-server version: ${initialized.userAgent ?? "unknown"}; requires 0.143.0+`,
			);
			this.fail(error);
			throw error;
		}
		this.write?.({ jsonrpc: "2.0", method: "initialized" });
	}
	private handleLine(line: string): void {
		let frame: RpcFrame;
		try {
			frame = JSON.parse(line) as RpcFrame;
		} catch {
			return;
		}
		if (frame.id !== undefined && !frame.method) {
			const pending = this.pending.get(frame.id);
			if (!pending) return;
			this.pending.delete(frame.id);
			frame.error
				? pending.reject(new Error(frame.error.message ?? "Codex RPC error"))
				: pending.resolve(frame.result);
			return;
		}
		if (!frame.method) return;
		const params = frame.params ?? {};
		if (!this.matches(params)) return;
		if (frame.id !== undefined && APPROVAL_METHODS.has(frame.method)) {
			this.handleApproval(frame.id, params);
			return;
		}
		const notify = (update: SessionUpdate) =>
			this.client.notify("session/update", {
				sessionId: this.threadId ?? String(params.threadId ?? "codex-pending"),
				update,
			});
		if (frame.method === "thread/tokenUsage/updated") {
			const update = codexUsageUpdate(params);
			if (update) void notify(update);
			return;
		}
		if (frame.method === "thread/settings/updated") {
			const settings = params.threadSettings;
			if (settings && typeof settings === "object") {
				this.updateThreadSettings(settings as Record<string, unknown>);
				void notify({
					sessionUpdate: "config_option_update",
					configOptions: this.configOptions(),
				});
			}
			return;
		}
		if (
			["item/agentMessage/delta", "item/plan/delta"].includes(frame.method) &&
			typeof params.delta === "string"
		) {
			void notify({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: params.delta },
			});
			return;
		}
		if (frame.method === "item/started" || frame.method === "item/completed") {
			const item = params.item;
			if (!item || typeof item !== "object") return;
			const record = item as Record<string, unknown>;
			if (
				record.type === "contextCompaction" ||
				record.type === "context_compaction"
			) {
				this.contextCompactionItemTurnId =
					typeof params.turnId === "string" ? params.turnId : null;
				void notify({
					sessionUpdate: "agent_message_chunk",
					content: {
						type: "text",
						text:
							frame.method === "item/started"
								? "Compacting context..."
								: "Context compacted.",
					},
				});
			} else if (record.type === "agentMessage" || record.type === "plan") {
				const text = typeof record.text === "string" ? record.text : "";
				if (text)
					void notify({
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text },
					});
			} else if (record.type !== "reasoning" && record.type !== "userMessage") {
				const update = codexToolUpdate(record);
				this.toolCalls.set(update.toolCallId, update);
				void notify(update);
			}
			return;
		}
		if (frame.method === "turn/completed") {
			const completed = params.turn as
				| { id?: string; status?: string }
				| undefined;
			if (
				!this.turn ||
				(completed?.id && this.turn.id && completed.id !== this.turn.id)
			)
				return;
			const turn = this.turn;
			this.turn = null;
			turn.resolve({
				stopReason:
					completed?.status === "interrupted" ? "cancelled" : "end_turn",
			});
			return;
		}
		if (frame.method === "thread/compacted") {
			if (
				typeof params.turnId === "string" &&
				params.turnId === this.contextCompactionItemTurnId
			) {
				return;
			}
			void notify({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Context compacted." },
			});
			return;
		}
		if (frame.method === "error") {
			const error = params.error as { message?: string } | undefined;
			void notify({
				sessionUpdate: "agent_message_chunk",
				content: {
					type: "text",
					text: `[Codex error] ${error?.message ?? "unknown error"}`,
				},
			});
			return;
		}
		if (!QUIET_NOTIFICATIONS.has(frame.method)) return;
	}
	private handleApproval(id: RpcId, params: Record<string, unknown>): void {
		const options = codexDecisionOptions(params.availableDecisions);
		const itemId = String(params.itemId ?? "codex-approval");
		const existing = this.toolCalls.get(itemId);
		const directCommand =
			typeof params.command === "string" ? params.command : undefined;
		const rawInput = directCommand
			? { command: directCommand }
			: existing?.rawInput;
		const command =
			rawInput && typeof rawInput === "object" && "command" in rawInput
				? rawInput.command
				: undefined;
		const title =
			typeof command === "string" && command.trim()
				? command
				: String(params.reason ?? existing?.title ?? "Codex approval");
		void this.client
			.request("session/request_permission", {
				sessionId: this.threadId ?? String(params.threadId ?? "codex-pending"),
				toolCall: {
					toolCallId: itemId,
					title,
					kind: existing?.kind ?? "execute",
					status: "pending",
					rawInput,
				},
				options: options.map(({ value: _value, ...option }) => option),
			})
			.then((response) =>
				this.write?.({
					jsonrpc: "2.0",
					id,
					result: { decision: selectedCodexDecision(response, options) },
				}),
			)
			.catch((_error: unknown) =>
				this.write?.({ jsonrpc: "2.0", id, result: { decision: "cancel" } }),
			);
	}
	private async loadModels(): Promise<void> {
		const models: CodexModel[] = [];
		let cursor: string | null = null;
		const seenCursors = new Set<string>();
		try {
			do {
				const response = (await this.request("model/list", {
					limit: 100,
					...(cursor ? { cursor } : {}),
				})) as { data?: unknown; nextCursor?: unknown };
				if (Array.isArray(response.data)) {
					models.push(
						...response.data.filter(
							(model): model is CodexModel =>
								model != null &&
								typeof model === "object" &&
								typeof (model as Partial<CodexModel>).model === "string" &&
								typeof (model as Partial<CodexModel>).displayName ===
									"string" &&
								Array.isArray(
									(model as Partial<CodexModel>).supportedReasoningEfforts,
								),
						),
					);
				}
				const nextCursor =
					typeof response.nextCursor === "string" ? response.nextCursor : null;
				if (!nextCursor || seenCursors.has(nextCursor)) break;
				seenCursors.add(nextCursor);
				cursor = nextCursor;
			} while (cursor);
			this.models = models;
		} catch {
			// Model metadata is optional UI enrichment. Thread creation can still
			// report the selected model when an older app-server lacks model/list.
			this.models = [];
		}
	}

	private selectedModel(): CodexModel | null {
		return (
			this.models.find((candidate) => candidate.model === this.model) ?? null
		);
	}

	private updateThreadSettings(settings: Record<string, unknown>): void {
		if (typeof settings.model === "string") this.model = settings.model;
		if (typeof settings.effort === "string") {
			this.reasoningEffort = settings.effort;
		} else if (settings.effort === null) {
			this.reasoningEffort =
				this.selectedModel()?.defaultReasoningEffort ?? null;
		}
	}

	async newSession(
		cwd: string,
		mcpServers: readonly McpServer[] = [],
		requestedModel?: string,
		strictModel = false,
	): Promise<string> {
		try {
			await this.boot();
			await this.loadModels();
			const response = (await this.request("thread/start", {
				cwd,
				approvalPolicy: "on-request",
				sandbox: "workspace-write",
				...(requestedModel ? { model: requestedModel } : {}),
				config: codexMcpConfig(mcpServers),
			})) as {
				thread?: { id?: string };
				model?: unknown;
				reasoningEffort?: unknown;
			};
			const id = response.thread?.id;
			if (!id) throw new Error("Codex did not return a thread id");
			this.model = typeof response.model === "string" ? response.model : null;
			this.reasoningEffort =
				typeof response.reasoningEffort === "string"
					? response.reasoningEffort
					: (this.selectedModel()?.defaultReasoningEffort ?? null);
			if (strictModel && this.model !== requestedModel) {
				throw new Error(
					`Codex did not confirm required model "${requestedModel}"`,
				);
			}
			this.threadId = id;
			return id;
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}
	configOptions(): SessionConfigOption[] {
		if (!this.model) return [];
		const catalogModels = this.models.filter((candidate) => !candidate.hidden);
		const modelOptions = catalogModels.map((candidate) => ({
			value: candidate.model,
			name: candidate.displayName,
		}));
		if (!catalogModels.some((candidate) => candidate.model === this.model)) {
			modelOptions.unshift({ value: this.model, name: this.model });
		}
		const options: SessionConfigOption[] = [
			{
				id: "model",
				name: "Model",
				description: "AI model used for subsequent Codex turns",
				category: "model",
				type: "select",
				currentValue: this.model,
				options: modelOptions,
			},
		];
		const selectedModel = this.selectedModel();
		if (selectedModel && this.reasoningEffort) {
			options.push({
				id: "reasoning_effort",
				name: "Reasoning effort",
				description: "Reasoning depth used for subsequent Codex turns",
				category: "thought_level",
				type: "select",
				currentValue: this.reasoningEffort,
				options: selectedModel.supportedReasoningEfforts.map((effort) => ({
					value: effort.reasoningEffort,
					name:
						effort.reasoningEffort.charAt(0).toUpperCase() +
						effort.reasoningEffort.slice(1),
				})),
			});
		}
		return options;
	}

	async setConfigOption(configId: string, value: unknown) {
		if (!this.threadId) throw new Error("Codex session is not initialized");
		if (typeof value !== "string") {
			throw new Error(`Codex config option "${configId}" must be a string`);
		}
		if (configId === "model") {
			const selectedModel = this.models.find(
				(candidate) => candidate.model === value && !candidate.hidden,
			);
			if (
				(!selectedModel && this.models.length > 0) ||
				(selectedModel?.hidden && value !== this.model)
			) {
				throw new Error(`Codex does not expose model "${value}"`);
			}
			const supportedEfforts = selectedModel?.supportedReasoningEfforts ?? [];
			const effort = supportedEfforts.some(
				(option) => option.reasoningEffort === this.reasoningEffort,
			)
				? this.reasoningEffort
				: (selectedModel?.defaultReasoningEffort ?? this.reasoningEffort);
			await this.request("thread/settings/update", {
				threadId: this.threadId,
				model: value,
				...(effort ? { effort } : {}),
			});
			this.model = value;
			this.reasoningEffort = effort;
			return { configOptions: this.configOptions() };
		}
		if (configId === "reasoning_effort") {
			const supported =
				this.selectedModel()?.supportedReasoningEfforts.some(
					(option) => option.reasoningEffort === value,
				) ?? false;
			if (!supported) {
				throw new Error(
					`Codex model "${this.model}" does not support reasoning effort "${value}"`,
				);
			}
			await this.request("thread/settings/update", {
				threadId: this.threadId,
				effort: value,
			});
			this.reasoningEffort = value;
			return { configOptions: this.configOptions() };
		}
		throw new Error(`Codex does not support ACP config option "${configId}"`);
	}
	async loadSession(
		sessionId: string,
		cwd: string,
		mcpServers: readonly McpServer[] = [],
	): Promise<void> {
		try {
			await this.boot();
			await this.loadModels();
			const response = (await this.request("thread/resume", {
				threadId: sessionId,
				cwd,
				config: codexMcpConfig(mcpServers),
			})) as {
				thread?: { id?: string };
				model?: unknown;
				reasoningEffort?: unknown;
			};
			this.threadId = response.thread?.id ?? sessionId;
			this.model = typeof response.model === "string" ? response.model : null;
			this.reasoningEffort =
				typeof response.reasoningEffort === "string"
					? response.reasoningEffort
					: (this.selectedModel()?.defaultReasoningEffort ?? null);
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}
	async prompt(prompt: unknown[]): Promise<{ stopReason: StopReason }> {
		if (!this.threadId) throw new Error("Codex session is not initialized");
		const text = prompt
			.map((block) =>
				typeof block === "object" &&
				block &&
				"type" in block &&
				(block as { type?: unknown }).type === "text"
					? String((block as { text?: unknown }).text ?? "")
					: JSON.stringify(block),
			)
			.join("\n");
		let settle:
			| {
					resolve(value: { stopReason: StopReason }): void;
					reject(error: Error): void;
			  }
			| undefined;
		const completion = new Promise<{ stopReason: StopReason }>(
			(resolve, reject) => {
				settle = { resolve, reject };
			},
		);
		if (!settle) throw new Error("failed to initialize Codex turn completion");
		// Install the active turn before turn/start: a child can exit after it
		// receives the request but before it sends the response.
		const activeTurn = { id: null as string | null, ...settle };
		this.turn = activeTurn;
		let response: { turn?: { id?: string } };
		try {
			response = (await this.request("turn/start", {
				threadId: this.threadId,
				input: [{ type: "text", text }],
			})) as { turn?: { id?: string } };
		} catch (error) {
			if (this.turn === activeTurn) this.turn = null;
			activeTurn.reject(
				error instanceof Error ? error : new Error(String(error)),
			);
			return completion;
		}
		const id = response.turn?.id ?? null;
		activeTurn.id = id;
		if (this.pendingCancel && id) {
			this.pendingCancel = false;
			void this.request("turn/interrupt", {
				threadId: this.threadId,
				turnId: id,
			});
		}
		return completion;
	}
	cancel(): void {
		if (this.threadId && this.turn?.id)
			void this.request("turn/interrupt", {
				threadId: this.threadId,
				turnId: this.turn.id,
			});
		else this.pendingCancel = true;
	}
}

export function isCodexBridgeMain(
	moduleUrl: string,
	argvEntry: string | undefined,
	bunMain: boolean | undefined,
): boolean {
	if (bunMain === true) return true;
	if (!argvEntry) return false;
	return fileURLToPath(moduleUrl) === path.resolve(argvEntry);
}

if (isCodexBridgeMain(import.meta.url, process.argv[1], import.meta.main)) {
	let bridge: CodexBridge | null = null;
	const app = agent({ name: "superset-codex-acp" })
		.onRequest("initialize", () => ({ protocolVersion: PROTOCOL_VERSION }))
		.onRequest("session/new", async (context) => {
			bridge = new CodexBridge(context.client);
			const requestedModel = process.env.SUPERSET_CODEX_MODEL;
			return {
				sessionId: await bridge.newSession(
					context.params.cwd,
					context.params.mcpServers,
					requestedModel,
					process.env.SUPERSET_CODEX_STRICT_MODEL === "1",
				),
				configOptions: bridge.configOptions(),
			};
		})
		.onRequest("session/load", async (context) => {
			bridge = new CodexBridge(context.client);
			await bridge.loadSession(
				context.params.sessionId,
				context.params.cwd,
				context.params.mcpServers,
			);
			return { configOptions: bridge.configOptions() };
		})
		.onRequest("session/prompt", (context) => {
			if (!bridge) throw new Error("Codex session is not initialized");
			return bridge.prompt(context.params.prompt);
		})
		.onRequest("session/set_config_option", (context) => {
			if (!bridge) throw new Error("Codex session is not initialized");
			return bridge.setConfigOption(
				context.params.configId,
				context.params.value,
			);
		})
		.onNotification("session/cancel", () => bridge?.cancel());
	const stream = ndJsonStream(
		Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
		Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
	);
	app.connect(stream);
}

// Kept explicit for ESM production bundles (URL.pathname breaks encoded paths).
export const codexAppServerAcpEntry = fileURLToPath(import.meta.url);
