/** ACP facade for Codex app-server JSON-RPC. */
import { spawn } from "node:child_process";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
	agent,
	ndJsonStream,
	PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type {
	PermissionOption,
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionUpdate,
	StopReason,
	ToolKind,
} from "@superset/session-protocol";

const MIN_VERSION = [0, 143, 0];
const APPROVAL_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
]);
const QUIET_NOTIFICATIONS = new Set([
	"thread/started",
	"thread/status/changed",
	"thread/tokenUsage/updated",
	"turn/started",
	"turn/diff/updated",
	"turn/plan/updated",
	"thread/compacted",
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
function toolUpdate(item: Record<string, unknown>): CodexToolCallUpdate {
	const status =
		item.status === "failed" || item.status === "declined"
			? "failed"
			: item.status === "completed"
				? "completed"
				: "in_progress";
	const command = typeof item.command === "string" ? item.command : "";
	const changes = Array.isArray(item.changes) ? item.changes : [];
	return {
		sessionUpdate: "tool_call",
		toolCallId: String(item.id),
		title:
			item.type === "fileChange"
				? `Edit ${changes.length} file${changes.length === 1 ? "" : "s"}`
				: command || String(item.tool ?? item.type ?? "Codex tool"),
		kind: toolKind(item),
		status,
		rawInput: item.type === "fileChange" ? { changes } : { command },
		rawOutput: item.aggregatedOutput ?? item.result,
	};
}

export class CodexBridge {
	private child: ReturnType<typeof spawn> | null = null;
	private pending = new Map<RpcId, PendingRpc>();
	private toolCalls = new Map<string, CodexToolCallUpdate>();
	private nextId = 1;
	private threadId: string | null = null;
	private turn: {
		id: string | null;
		resolve(value: { stopReason: StopReason }): void;
		reject(error: Error): void;
	} | null = null;
	private pendingCancel = false;
	private disposed = false;
	private write: ((frame: object) => void) | null = null;

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
			if (record.type === "agentMessage" || record.type === "plan") {
				const text = typeof record.text === "string" ? record.text : "";
				if (text)
					void notify({
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text },
					});
			} else if (record.type !== "reasoning" && record.type !== "userMessage") {
				const update = toolUpdate(record);
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
	async newSession(cwd: string): Promise<string> {
		try {
			await this.boot();
			const response = (await this.request("thread/start", {
				cwd,
				approvalPolicy: "on-request",
				sandbox: "workspace-write",
			})) as { thread?: { id?: string } };
			const id = response.thread?.id;
			if (!id) throw new Error("Codex did not return a thread id");
			this.threadId = id;
			return id;
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}
	async loadSession(sessionId: string, cwd: string): Promise<void> {
		try {
			await this.boot();
			const response = (await this.request("thread/resume", {
				threadId: sessionId,
				cwd,
			})) as { thread?: { id?: string } };
			this.threadId = response.thread?.id ?? sessionId;
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
			return { sessionId: await bridge.newSession(context.params.cwd) };
		})
		.onRequest("session/load", async (context) => {
			bridge = new CodexBridge(context.client);
			await bridge.loadSession(context.params.sessionId, context.params.cwd);
			return {};
		})
		.onRequest("session/prompt", (context) => {
			if (!bridge) throw new Error("Codex session is not initialized");
			return bridge.prompt(context.params.prompt);
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
