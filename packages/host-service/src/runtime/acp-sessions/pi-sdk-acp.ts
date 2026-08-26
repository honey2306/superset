/**
 * ACP adapter backed by the Pi coding-agent SDK.
 *
 * This file is bundled as a standalone child process.  Keep the SDK import on
 * this side of the ACP boundary: the host daemon only speaks ACP and never
 * loads Pi's runtime into its own process.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import readline from "node:readline";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
	type Agent,
	AgentSideConnection,
	type AgentSideConnection as AgentSideConnectionType,
	type AvailableCommand,
	type CancelNotification,
	type DeleteSessionRequest,
	type DeleteSessionResponse,
	type InitializeRequest,
	type InitializeResponse,
	type ListSessionsRequest,
	type ListSessionsResponse,
	type LoadSessionRequest,
	type LoadSessionResponse,
	type McpServer,
	type NewSessionRequest,
	type NewSessionResponse,
	ndJsonStream,
	type PermissionOption,
	PROTOCOL_VERSION,
	type PromptRequest,
	type PromptResponse,
	RequestError,
	type RequestPermissionResponse,
	type SessionConfigOption,
	type SessionInfo,
	type SetSessionConfigOptionRequest,
	type SetSessionConfigOptionResponse,
	type SetSessionModeRequest,
	type SetSessionModeResponse,
	type StopReason,
	type ToolCallUpdate,
	type ToolKind,
} from "@agentclientprotocol/sdk";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import {
	type AgentSession,
	type AgentSessionEvent,
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionUIContext,
	type ExtensionUIDialogOptions,
	getAgentDir,
	ModelRuntime,
	SessionManager,
	SettingsManager,
	type Theme,
	type ToolDefinition,
	type WorkingIndicatorOptions,
} from "@earendil-works/pi-coding-agent";
import { SUPERSET_DELEGATION_META_KEY } from "@superset/session-protocol";
import {
	acpImageKey,
	extractAcpImageBlocks,
	type ImageContentBlock,
} from "./image-promotion";

const MODEL_CONFIG_ID = "model";
const THINKING_CONFIG_ID = "thought_level";
const PI_DISABLE_EXTENSIONS_ENV = "SUPERSET_PI_ACP_DISABLE_EXTENSIONS";
const PI_APPEND_SYSTEM_PROMPT_ENV = "SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_REQUEST_TIMEOUT_MS = 90_000;
const MCP_TOOL_CALL_TIMEOUT_MS = 120_000;
const LONG_RUNNING_TOOL_NAMES = new Set(["ask_user", "wait_delegation"]);
const MAX_SESSION_PAGE_SIZE = 50;
const ACP_SESSION_MARKER_TYPE = "superset/acp-session";

type JsonRecord = Record<string, unknown>;

type McpTool = {
	name: string;
	title?: string;
	description?: string;
	inputSchema: object;
};

type McpToolResult = {
	content?: unknown;
	isError?: boolean;
	[key: string]: unknown;
};

type PendingMcpRequest = {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	removeAbortListener?: () => void;
	timeout?: ReturnType<typeof setTimeout>;
};

type McpServerProcess = Extract<McpServer, { command: string }>;

type SessionRuntime = {
	sessionId: string;
	cwd: string;
	additionalDirectories: string[];
	mcpClients: StdioMcpClient[];
	session: AgentSession;
	sessionManager: SessionManager;
	modelRuntime: ModelRuntime;
	unsubscribe: () => void;
	eventQueue: Promise<void>;
	promptActive: boolean;
	cancelRequested: boolean;
	assistantMessageId?: string;
	lastUsage?: UsageSnapshot;
};

export type UsageSnapshot = {
	inputTokens: number;
	outputTokens: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
};

function asRecord(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function jsonText(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function environmentFor(
	overrides: Record<string, string>,
): Record<string, string> {
	const inherited = Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);
	return { ...inherited, ...overrides };
}

function serverEnvironment(server: McpServerProcess): Record<string, string> {
	return Object.fromEntries(
		(server.env ?? []).map(({ name, value }) => [name, value]),
	);
}

function isMcpServerProcess(server: McpServer): server is McpServerProcess {
	return "command" in server && typeof server.command === "string";
}

/** Minimal JSON-RPC-over-stdio MCP client used by SDK custom tools. */
class StdioMcpClient {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<number, PendingMcpRequest>();
	private nextId = 1;
	private closed = false;

	constructor(server: McpServerProcess) {
		this.child = spawn(server.command, server.args, {
			env: environmentFor(serverEnvironment(server)),
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child.stderr.on("data", () => {
			// Drain diagnostics; MCP stderr must never corrupt the ACP stream.
		});
		readline
			.createInterface({
				input: this.child.stdout,
				crlfDelay: Number.POSITIVE_INFINITY,
			})
			.on("line", (line) => this.handleLine(line));
		this.child.on("error", (error) => {
			this.closed = true;
			this.failPending(error);
		});
		this.child.on("exit", (code, signal) => {
			this.closed = true;
			this.failPending(
				new Error(`MCP server exited (code=${code}, signal=${signal})`),
			);
		});
	}

	async initialize(): Promise<void> {
		await this.request(
			"initialize",
			{
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: { name: "superset-pi-sdk-acp", version: "1" },
			},
			undefined,
			MCP_REQUEST_TIMEOUT_MS,
		);
		this.notify("notifications/initialized", {});
	}

	async listTools(): Promise<McpTool[]> {
		const tools: McpTool[] = [];
		let cursor: string | undefined;
		do {
			const result = asRecord(
				await this.request(
					"tools/list",
					cursor ? { cursor } : {},
					undefined,
					MCP_REQUEST_TIMEOUT_MS,
				),
			);
			if (!result || !Array.isArray(result.tools)) {
				throw new Error("MCP tools/list returned an invalid result");
			}
			tools.push(
				...result.tools.filter(
					(tool): tool is McpTool =>
						asRecord(tool) !== null && typeof tool.name === "string",
				),
			);
			cursor = stringValue(result.nextCursor);
		} while (cursor);
		return tools;
	}

	async callTool(
		name: string,
		args: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<McpToolResult> {
		const result = await this.request(
			"tools/call",
			{ name, arguments: args },
			signal,
			LONG_RUNNING_TOOL_NAMES.has(name) ? undefined : MCP_TOOL_CALL_TIMEOUT_MS,
		);
		return asRecord(result) ?? { content: result };
	}

	async close(): Promise<void> {
		if (this.child.exitCode !== null || this.child.signalCode !== null) return;
		this.closed = true;
		this.failPending(new Error("MCP client closed"));
		await new Promise<void>((resolve) => {
			let settled = false;
			let forceKill: ReturnType<typeof setTimeout> | undefined;
			let giveUp: ReturnType<typeof setTimeout> | undefined;
			const finish = () => {
				if (settled) return;
				settled = true;
				if (forceKill) clearTimeout(forceKill);
				if (giveUp) clearTimeout(giveUp);
				this.child.off("exit", finish);
				resolve();
			};
			this.child.once("exit", finish);
			this.child.kill();
			forceKill = setTimeout(() => this.child.kill("SIGKILL"), 2_000);
			giveUp = setTimeout(finish, 4_000);
			forceKill.unref();
			giveUp.unref();
		});
	}

	private request(
		method: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		timeoutMs: number | undefined,
	): Promise<unknown> {
		if (this.closed) return Promise.reject(new Error("MCP client is closed"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const pending: PendingMcpRequest = { resolve, reject };
			if (timeoutMs !== undefined) {
				pending.timeout = setTimeout(() => {
					if (!this.pending.delete(id)) return;
					pending.removeAbortListener?.();
					this.notify("notifications/cancelled", {
						requestId: id,
						reason: `MCP request timed out: ${method}`,
					});
					reject(new Error(`MCP request timed out: ${method}`));
				}, timeoutMs);
				pending.timeout.unref();
			}
			if (signal) {
				const onAbort = () => {
					this.pending.delete(id);
					if (pending.timeout) clearTimeout(pending.timeout);
					this.notify("notifications/cancelled", {
						requestId: id,
						reason: "Pi tool call cancelled",
					});
					reject(new Error("MCP request cancelled"));
				};
				if (signal.aborted) {
					onAbort();
					return;
				}
				signal.addEventListener("abort", onAbort, { once: true });
				pending.removeAbortListener = () =>
					signal.removeEventListener("abort", onAbort);
			}
			this.pending.set(id, pending);
			this.write({ jsonrpc: "2.0", id, method, params });
		});
	}

	private notify(method: string, params: Record<string, unknown>): void {
		if (this.closed) return;
		this.write({ jsonrpc: "2.0", method, params });
	}

	private write(message: Record<string, unknown>): void {
		if (!this.child.stdin.destroyed)
			this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private handleLine(line: string): void {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			return;
		}
		const message = asRecord(value);
		if (
			!message ||
			(typeof message.id !== "number" && typeof message.id !== "string")
		)
			return;
		if (
			typeof message.method === "string" &&
			!Object.hasOwn(message, "result") &&
			!Object.hasOwn(message, "error")
		) {
			this.write(
				message.method === "ping"
					? { jsonrpc: "2.0", id: message.id, result: {} }
					: {
							jsonrpc: "2.0",
							id: message.id,
							error: { code: -32601, message: "Method not found" },
						},
			);
			return;
		}
		if (typeof message.id !== "number") return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (pending.timeout) clearTimeout(pending.timeout);
		pending.removeAbortListener?.();
		const error = asRecord(message.error);
		if (error) {
			pending.reject(
				new Error(`MCP error ${String(error.code)}: ${String(error.message)}`),
			);
		} else {
			pending.resolve(message.result);
		}
	}

	private failPending(error: Error): void {
		for (const pending of this.pending.values()) {
			if (pending.timeout) clearTimeout(pending.timeout);
			pending.removeAbortListener?.();
			pending.reject(error);
		}
		this.pending.clear();
	}
}

const CUSTOM_RESPONSE_META_KEY = "sh.superset/customResponse";
const SKIP_TRANSCRIPT_REPLAY_META_KEY = "sh.superset/skipTranscriptReplay";
type ExtensionUiMethod = "select" | "confirm" | "input" | "editor";

function cancelledPermissionResponse(): RequestPermissionResponse {
	return { outcome: { outcome: "cancelled" } };
}

export function extensionUiCustomResponse(
	response: RequestPermissionResponse,
): string | undefined {
	if (response.outcome.outcome !== "selected") return undefined;
	const value = response.outcome._meta?.[CUSTOM_RESPONSE_META_KEY];
	return typeof value === "string" ? value : undefined;
}

export function extensionUiPermissionOptions(
	method: ExtensionUiMethod,
	labels: readonly string[] = [],
): PermissionOption[] {
	if (method === "confirm") {
		return [
			{ optionId: "yes", name: "Yes", kind: "allow_once" },
			{ optionId: "no", name: "No", kind: "reject_once" },
		];
	}
	if (method === "input" || method === "editor") {
		return [{ optionId: "cancel", name: "Cancel", kind: "reject_once" }];
	}
	return [
		...labels.map((name, index) => ({
			optionId: `option-${index}`,
			name,
			kind: "allow_once" as const,
		})),
		{ optionId: "cancel", name: "Cancel", kind: "reject_once" },
	];
}

const ACP_THEME = {
	name: "acp",
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	italic: (text: string) => text,
	underline: (text: string) => text,
	inverse: (text: string) => text,
	strikethrough: (text: string) => text,
	getFgAnsi: () => "",
	getBgAnsi: () => "",
	getColorMode: () => "256color",
	getThinkingBorderColor: () => (text: string) => text,
	getBashModeBorderColor: () => (text: string) => text,
} as unknown as Theme;

/**
 * ACP-backed implementation of Pi's extension UI surface. Interactive
 * dialogs are represented as synthetic permission cards so the host can use
 * the existing approval/elicitation UI and persistence path.
 */
class AcpExtensionUiContext implements ExtensionUIContext {
	readonly theme: Theme = ACP_THEME;

	constructor(
		private readonly conn: AgentSideConnectionType,
		private readonly sessionId: string,
	) {}

	async select(
		title: string,
		options: string[],
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		const response = await this.request(
			"select",
			title,
			{ method: "select", title, options },
			extensionUiPermissionOptions("select", options),
			opts,
		);
		if (response.outcome.outcome !== "selected") return undefined;
		const index = Number.parseInt(
			response.outcome.optionId.replace("option-", ""),
			10,
		);
		return Number.isInteger(index) && index >= 0 ? options[index] : undefined;
	}

	async confirm(
		title: string,
		message: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<boolean> {
		const response = await this.request(
			"confirm",
			title,
			{ method: "confirm", title, message },
			extensionUiPermissionOptions("confirm"),
			opts,
		);
		return (
			response.outcome.outcome === "selected" &&
			response.outcome.optionId === "yes"
		);
	}

	async input(
		title: string,
		placeholder?: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		return this.dialogText("input", title, { placeholder }, opts);
	}

	notify(message: string, type: "info" | "warning" | "error" = "info"): void {
		if (type === "info") return;
		void this.conn
			.sessionUpdate({
				sessionId: this.sessionId,
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: message },
					_meta: { piAcp: { notify: { level: type } } },
				},
			})
			.catch(() => undefined);
	}

	onTerminalInput(
		_handler: Parameters<ExtensionUIContext["onTerminalInput"]>[0],
	): () => void {
		return () => undefined;
	}

	setStatus(_key: string, _text: string | undefined): void {}

	setWorkingMessage(_message?: string): void {}

	setWorkingVisible(_visible: boolean): void {}

	setWorkingIndicator(_options?: WorkingIndicatorOptions): void {}

	setHiddenThinkingLabel(_label?: string): void {}

	setWidget: ExtensionUIContext["setWidget"] = () => {};

	setFooter(_factory: Parameters<ExtensionUIContext["setFooter"]>[0]): void {}

	setHeader(_factory: Parameters<ExtensionUIContext["setHeader"]>[0]): void {}

	async custom<T>(
		_factory: Parameters<ExtensionUIContext["custom"]>[0],
		_options?: Parameters<ExtensionUIContext["custom"]>[1],
	): Promise<T> {
		throw new Error("Pi custom extension UI is unavailable in ACP");
	}

	pasteToEditor(_text: string): void {}

	setEditorText(_text: string): void {}

	getEditorText(): string {
		return "";
	}

	async editor(title: string, prefill?: string): Promise<string | undefined> {
		return this.dialogText("editor", title, { prefill }, undefined);
	}

	addAutocompleteProvider(
		_factory: Parameters<ExtensionUIContext["addAutocompleteProvider"]>[0],
	): void {}

	setEditorComponent(
		_factory: Parameters<ExtensionUIContext["setEditorComponent"]>[0],
	): void {}

	getEditorComponent(): ReturnType<ExtensionUIContext["getEditorComponent"]> {
		return undefined;
	}

	getAllThemes(): ReturnType<ExtensionUIContext["getAllThemes"]> {
		return [];
	}

	getTheme(_name: string): ReturnType<ExtensionUIContext["getTheme"]> {
		return undefined;
	}

	setTheme(
		_theme: Parameters<ExtensionUIContext["setTheme"]>[0],
	): ReturnType<ExtensionUIContext["setTheme"]> {
		return { success: false, error: "Themes are unavailable in ACP" };
	}

	getToolsExpanded(): boolean {
		return false;
	}

	setToolsExpanded(_expanded: boolean): void {}

	setTitle(_title: string): void {}

	private async inputOrEditor(
		method: "input" | "editor",
		title: string,
		value: JsonRecord,
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		const response = await this.request(
			method,
			title,
			{ method, title, ...value },
			extensionUiPermissionOptions(method),
			opts,
		);
		return extensionUiCustomResponse(response);
	}

	private async dialogText(
		method: "input" | "editor",
		title: string,
		value: JsonRecord,
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined> {
		return this.inputOrEditor(method, title, value, opts);
	}

	private async request(
		_method: ExtensionUiMethod,
		title: string,
		rawInput: JsonRecord,
		options: PermissionOption[],
		opts?: ExtensionUIDialogOptions,
	): Promise<RequestPermissionResponse> {
		const toolCallId = `pi-ui-${crypto.randomUUID()}`;
		const toolCall: ToolCallUpdate = {
			toolCallId,
			title,
			kind: "other",
			status: "pending",
			rawInput,
		};
		try {
			await this.conn.sessionUpdate({
				sessionId: this.sessionId,
				update: {
					sessionUpdate: "tool_call",
					toolCallId,
					title,
					kind: "other",
					status: "pending",
					rawInput,
				},
			});
			const response = await this.waitForPermission(
				{ sessionId: this.sessionId, toolCall, options },
				opts,
			);
			await this.finish(toolCallId, response);
			return response;
		} catch {
			const response = cancelledPermissionResponse();
			await this.finish(toolCallId, response);
			return response;
		}
	}

	private async waitForPermission(
		request: Parameters<AgentSideConnectionType["requestPermission"]>[0],
		opts?: ExtensionUIDialogOptions,
	): Promise<RequestPermissionResponse> {
		if (opts?.signal?.aborted) return cancelledPermissionResponse();
		return new Promise((resolve) => {
			let settled = false;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const finish = (response: RequestPermissionResponse) => {
				if (settled) return;
				settled = true;
				if (timeout) clearTimeout(timeout);
				opts?.signal?.removeEventListener("abort", onAbort);
				resolve(response);
			};
			const onAbort = () => finish(cancelledPermissionResponse());
			void this.conn.requestPermission(request).then(finish, onAbort);
			if (opts?.signal) {
				opts.signal.addEventListener("abort", onAbort, { once: true });
			}
			if (typeof opts?.timeout === "number" && opts.timeout >= 0) {
				timeout = setTimeout(onAbort, opts.timeout);
				timeout.unref();
			}
		});
	}

	private async finish(
		toolCallId: string,
		response: RequestPermissionResponse,
	): Promise<void> {
		try {
			await this.conn.sessionUpdate({
				sessionId: this.sessionId,
				update: {
					sessionUpdate: "tool_call_update",
					toolCallId,
					status:
						response.outcome.outcome === "selected" ? "completed" : "failed",
				},
			});
		} catch {
			// The ACP connection may close while a dialog is being cancelled.
		}
	}
}

function mcpContent(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) return [{ type: "text", text: jsonText(value) }];
	return value.map((item) => {
		const record = asRecord(item);
		if (!record) return { type: "text", text: jsonText(item) };
		if (
			record.type === "image" &&
			typeof record.data === "string" &&
			typeof record.mimeType === "string"
		) {
			return { type: "image", data: record.data, mimeType: record.mimeType };
		}
		if (record.type === "text" && typeof record.text === "string") {
			return { type: "text", text: record.text };
		}
		return { type: "text", text: jsonText(item) };
	});
}

async function mcpTools(
	servers: readonly McpServer[],
): Promise<{ clients: StdioMcpClient[]; tools: ToolDefinition[] }> {
	const clients: StdioMcpClient[] = [];
	const tools: ToolDefinition[] = [];
	const registeredNames = new Set<string>();
	try {
		for (const server of servers) {
			if (!isMcpServerProcess(server)) {
				throw new Error(
					`Unsupported ACP MCP transport for ${server.name}: ${server.type ?? "unknown"}`,
				);
			}
			const client = new StdioMcpClient(server);
			clients.push(client);
			await client.initialize();
			for (const tool of await client.listTools()) {
				if (registeredNames.has(tool.name)) {
					throw new Error(`Duplicate ACP MCP tool name: ${tool.name}`);
				}
				registeredNames.add(tool.name);
				const toolName = tool.name;
				tools.push({
					name: toolName,
					label: tool.title ?? toolName,
					description: tool.description ?? `${server.name} MCP tool`,
					parameters: tool.inputSchema as never,
					async execute(_toolCallId, params, signal) {
						const result = await client.callTool(
							toolName,
							(asRecord(params) ?? {}) as Record<string, unknown>,
							signal,
						);
						return {
							content: mcpContent(result.content) as never,
							details: { mcpResult: result },
							isError: result.isError === true,
						};
					},
				});
			}
		}
		return { clients, tools };
	} catch (error) {
		await Promise.allSettled(clients.map((client) => client.close()));
		throw error;
	}
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return jsonText(content);
	return content
		.map((item) => {
			const record = asRecord(item);
			return record?.type === "text" && typeof record.text === "string"
				? record.text
				: "";
		})
		.filter(Boolean)
		.join("\n");
}

/**
 * Pi/MCP tool results may contain image blocks directly, nested in MCP
 * metadata, or serialized inside a text content block. Normalize all of those
 * forms before projecting them into assistant message content, and collapse
 * repeated references to the same image from one tool result.
 */
export function piToolResultImageBlocks(value: unknown): ImageContentBlock[] {
	const images = new Map<string, ImageContentBlock>();
	for (const image of extractAcpImageBlocks(value)) {
		images.set(acpImageKey(image), image);
	}
	return [...images.values()];
}

export function promptText(prompt: PromptRequest["prompt"]): string {
	return prompt
		.map((block) => {
			const record = asRecord(block);
			if (record?.type === "text" && typeof record.text === "string") {
				return record.text;
			}
			if (record?.type === "resource_link") {
				return [record.name, record.description, record.uri]
					.filter((value): value is string => typeof value === "string")
					.join("\n");
			}
			if (record?.type === "resource") return jsonText(record.resource);
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function promptImages(
	prompt: PromptRequest["prompt"],
): Array<Record<string, string>> {
	return prompt.flatMap((block) => {
		const record = asRecord(block);
		return record?.type === "image" &&
			typeof record.data === "string" &&
			typeof record.mimeType === "string"
			? [{ type: "image", data: record.data, mimeType: record.mimeType }]
			: [];
	});
}

export function shouldReplayTranscript(meta: unknown): boolean {
	return asRecord(meta)?.[SKIP_TRANSCRIPT_REPLAY_META_KEY] !== true;
}

export function extractSystemInstructions(meta: unknown): string | undefined {
	const record = asRecord(meta);
	const value = record?.[SUPERSET_DELEGATION_META_KEY];
	if (typeof value === "string" && value.trim()) return value.trim();
	const environmentValue = process.env[PI_APPEND_SYSTEM_PROMPT_ENV];
	return environmentValue?.trim() || undefined;
}

export function toolKind(toolName: string): ToolKind {
	if (toolName === "bash") return "execute";
	if (toolName === "read") return "read";
	if (toolName === "write" || toolName === "edit") return "edit";
	if (toolName === "grep" || toolName === "find" || toolName === "ls")
		return "search";
	return "other";
}

function usageFromStats(stats: unknown): UsageSnapshot | undefined {
	const record = asRecord(stats);
	const tokens = asRecord(record?.tokens);
	if (!tokens) return undefined;
	const number = (key: string): number =>
		typeof tokens[key] === "number" && Number.isFinite(tokens[key])
			? (tokens[key] as number)
			: 0;
	return {
		inputTokens: number("input"),
		outputTokens: number("output"),
		cacheRead: number("cacheRead"),
		cacheWrite: number("cacheWrite"),
		totalTokens: number("total"),
	};
}

export function usageFromMessage(message: unknown): UsageSnapshot | undefined {
	const usage = asRecord(asRecord(message)?.usage);
	if (!usage) return undefined;
	const number = (key: string): number =>
		typeof usage[key] === "number" && Number.isFinite(usage[key])
			? (usage[key] as number)
			: 0;
	const inputTokens = number("input");
	const outputTokens = number("output");
	const cacheRead = number("cacheRead");
	const cacheWrite = number("cacheWrite");
	const totalTokens =
		number("totalTokens") ||
		inputTokens + outputTokens + cacheRead + cacheWrite;
	return { inputTokens, outputTokens, cacheRead, cacheWrite, totalTokens };
}

export function acpUsage(
	usage: UsageSnapshot | undefined,
): PromptResponse["usage"] {
	if (!usage) return undefined;
	return {
		totalTokens: usage.totalTokens,
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		cachedReadTokens: usage.cacheRead,
		cachedWriteTokens: usage.cacheWrite,
	};
}

function thinkingLevels(session: AgentSession): string[] {
	const levels = session.getAvailableThinkingLevels();
	return levels.length > 0
		? levels
		: ["off", "minimal", "low", "medium", "high", "xhigh"];
}

function builtinCommands(): AvailableCommand[] {
	return [
		{
			name: "compact",
			description: "Manually compact the session context",
			input: { hint: "optional custom instructions" },
		},
		{ name: "session", description: "Show session statistics" },
		{
			name: "name",
			description: "Set session display name",
			input: { hint: "<name>" },
		},
		{
			name: "steering",
			description: "Get/set pi steering message delivery mode",
			input: { hint: "all | one-at-a-time" },
		},
		{
			name: "follow-up",
			description: "Get/set pi follow-up delivery mode",
			input: { hint: "all | one-at-a-time" },
		},
	];
}

function commandsFor(session: AgentSession): AvailableCommand[] {
	const extensionCommands = session.extensionRunner
		.getRegisteredCommands()
		.map((command) => ({
			name: command.invocationName,
			description: command.description ?? "",
		}));
	const result: AvailableCommand[] = [];
	const seen = new Set<string>();
	for (const command of [...extensionCommands, ...builtinCommands()]) {
		if (seen.has(command.name)) continue;
		seen.add(command.name);
		result.push(command);
	}
	return result;
}

function configOptions(
	runtime: ModelRuntime,
	session: AgentSession,
): SessionConfigOption[] {
	const availableModels = runtime.getAvailableSnapshot();
	const sourceModels =
		availableModels.length > 0 ? availableModels : runtime.getModels();
	const models = sourceModels.map((model) => ({
		value: `${model.provider}/${model.id}`,
		name: `${model.provider}/${model.name ?? model.id}`,
		description: null,
	}));
	const options: SessionConfigOption[] = [
		{
			type: "select",
			id: THINKING_CONFIG_ID,
			category: "thought_level",
			name: "Thinking",
			description: "Set the reasoning effort for this session",
			currentValue: session.thinkingLevel,
			options: thinkingLevels(session).map((id) => ({
				value: id,
				name: `Thinking: ${id}`,
				description: null,
			})),
		},
	];
	if (models.length > 0) {
		const model = session.model;
		const currentValue =
			model &&
			models.some((entry) => entry.value === `${model.provider}/${model.id}`)
				? `${model.provider}/${model.id}`
				: (models[0]?.value ?? "");
		options.unshift({
			type: "select",
			id: MODEL_CONFIG_ID,
			category: "model",
			name: "Model",
			description: "Select the model for this session",
			currentValue,
			options: models,
		});
	}
	return options;
}

function asStopReason(value: unknown, cancelled: boolean): StopReason {
	if (cancelled) return "cancelled";
	if (
		value === "max_tokens" ||
		value === "max_turn_requests" ||
		value === "refusal" ||
		value === "cancelled"
	)
		return value;
	return "end_turn";
}

export function modelRuntimeCreateOptions(): {
	allowModelNetwork: false;
	refreshOnCreate: true;
} {
	return {
		// Restore local model/auth availability, but never fetch the remote catalog
		// during ACP startup. The SDK's default for allowModelNetwork is false, but
		// keeping it explicit protects the adapter from a future default change.
		allowModelNetwork: false,
		refreshOnCreate: true,
	};
}

export function promptFailure(error: unknown): RequestError {
	if (error instanceof RequestError) return error;
	const message = error instanceof Error ? error.message : String(error);
	return RequestError.internalError(
		{ message },
		`Pi prompt failed: ${message}`,
	);
}

/**
 * Materialize a brand-new SDK session before ACP returns session/new.
 *
 * Pi intentionally defers header-only session files until an assistant message
 * exists. ACP may issue session/load immediately after session/new, so append a
 * custom entry (ignored by the model context and replay UI), write the SDK's
 * public header/entries snapshot, and reopen it through the public API to mark
 * the manager as flushed. Existing/open managers must not call this helper.
 */
export function persistNewSessionMarker(sessionManager: SessionManager): void {
	sessionManager.appendCustomEntry(ACP_SESSION_MARKER_TYPE, { version: 1 });
	const sessionFile = sessionManager.getSessionFile();
	const header = sessionManager.getHeader();
	if (!sessionFile || !header) {
		throw new Error("Pi SDK did not allocate a persistent session file");
	}
	if (!existsSync(sessionFile)) {
		const entries = [header, ...sessionManager.getEntries()];
		writeFileSync(
			sessionFile,
			`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
			{ flag: "wx" },
		);
	}
	// Reopening the same path is the SDK-supported way to rebuild its indexes and
	// mark the file flushed; later model/thinking entries can then append safely.
	sessionManager.setSessionFile(sessionFile);
}

export class PiSdkAcpAgent implements Agent {
	private readonly sessions = new Map<string, SessionRuntime>();
	private readonly modelRuntimePromise: Promise<ModelRuntime>;
	private lastSessionCwd: string | undefined;

	constructor(private readonly conn: AgentSideConnectionType) {
		this.modelRuntimePromise = ModelRuntime.create(modelRuntimeCreateOptions());
	}

	async initialize(params: InitializeRequest): Promise<InitializeResponse> {
		const requested = params.protocolVersion;
		return {
			protocolVersion:
				requested === PROTOCOL_VERSION ? requested : PROTOCOL_VERSION,
			agentInfo: {
				name: "superset-pi-sdk-acp",
				title: "Pi SDK ACP adapter",
				version: "0.84.2",
			},
			agentCapabilities: {
				loadSession: true,
				mcpCapabilities: { http: false, sse: false },
				promptCapabilities: {
					image: true,
					audio: false,
					embeddedContext: true,
				},
				sessionCapabilities: { list: {}, delete: {}, close: {} },
			},
		};
	}

	async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
		this.assertCwd(params.cwd);
		const runtime = await this.createRuntime({
			cwd: params.cwd,
			additionalDirectories: params.additionalDirectories ?? [],
			mcpServers: params.mcpServers,
			meta: params._meta,
		});
		this.lastSessionCwd = params.cwd;
		const response = sessionResponse(
			runtime.sessionId,
			configOptionsFromRuntime(runtime),
		);
		setTimeout(() => {
			void this.emitCommands(runtime);
		}, 0);
		return response;
	}

	async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
		this.assertCwd(params.cwd);
		await this.closeRuntime(params.sessionId);
		const sessions = await SessionManager.list(params.cwd);
		const stored = sessions.find((entry) => entry.id === params.sessionId);
		if (!stored)
			throw RequestError.invalidParams(
				`Unknown sessionId: ${params.sessionId}`,
			);
		const runtime = await this.createRuntime({
			cwd: params.cwd,
			additionalDirectories: params.additionalDirectories ?? [],
			mcpServers: params.mcpServers,
			meta: params._meta,
			sessionManager: SessionManager.open(stored.path, undefined, params.cwd),
			sessionId: params.sessionId,
		});
		this.lastSessionCwd = params.cwd;
		if (shouldReplayTranscript(params._meta)) await this.replay(runtime);
		const response = sessionResponse(
			runtime.sessionId,
			configOptionsFromRuntime(runtime),
			true,
		);
		setTimeout(() => {
			void this.emitCommands(runtime);
		}, 0);
		return response;
	}

	async resumeSession(params: {
		sessionId: string;
		cwd: string;
		mcpServers?: McpServer[];
	}): Promise<LoadSessionResponse> {
		const loaded = await this.loadSession({
			...params,
			mcpServers: params.mcpServers ?? [],
		});
		return loaded;
	}

	async prompt(params: PromptRequest): Promise<PromptResponse> {
		const runtime = this.sessions.get(params.sessionId);
		if (!runtime)
			throw RequestError.invalidParams(
				`Unknown sessionId: ${params.sessionId}`,
			);
		if (runtime.promptActive)
			throw RequestError.invalidParams("Session prompt is already active");
		runtime.promptActive = true;
		runtime.cancelRequested = false;
		runtime.assistantMessageId = undefined;
		const text = promptText(params.prompt);
		const images = promptImages(params.prompt);
		// The host manager journals and broadcasts user chunks before calling the
		// adapter. Re-emitting them here duplicates user messages in the timeline;
		// replay() remains responsible for restoring persisted user messages.
		try {
			const commandResponse = await this.handleBuiltinCommand(
				runtime,
				text,
				images.length > 0,
			);
			if (commandResponse) return commandResponse;
			await runtime.session.prompt(text, {
				images: images as never,
				expandPromptTemplates: true,
				source: "rpc",
			});
			await runtime.eventQueue;
			const stats = runtime.session.getSessionStats();
			runtime.lastUsage = usageFromStats(stats) ?? runtime.lastUsage;
			return {
				stopReason: asStopReason(undefined, runtime.cancelRequested),
				usage: acpUsage(runtime.lastUsage),
			};
		} catch (error) {
			if (runtime.cancelRequested) return { stopReason: "cancelled" };
			console.error("[pi-sdk-acp] prompt failed", error);
			throw promptFailure(error);
		} finally {
			runtime.promptActive = false;
		}
	}

	async cancel(params: CancelNotification): Promise<void> {
		const runtime = this.sessions.get(params.sessionId);
		if (!runtime) return;
		runtime.cancelRequested = true;
		await runtime.session.abort();
	}

	async listSessions(
		params: ListSessionsRequest,
	): Promise<ListSessionsResponse> {
		const cwd = params.cwd ?? this.lastSessionCwd;
		const all = cwd
			? await SessionManager.list(cwd)
			: await SessionManager.listAll();
		const offset = Number.parseInt(params.cursor ?? "0", 10);
		const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
		const page = all.slice(start, start + MAX_SESSION_PAGE_SIZE);
		const sessions: SessionInfo[] = page.map((entry) => ({
			sessionId: entry.id,
			cwd: entry.cwd,
			title: entry.name ?? entry.firstMessage ?? null,
			updatedAt: entry.modified.toISOString(),
		}));
		return {
			sessions,
			nextCursor:
				start + MAX_SESSION_PAGE_SIZE < all.length
					? String(start + MAX_SESSION_PAGE_SIZE)
					: null,
		};
	}

	async deleteSession(
		params: DeleteSessionRequest,
	): Promise<DeleteSessionResponse> {
		const runtime = this.sessions.get(params.sessionId);
		if (runtime) await this.closeRuntime(params.sessionId);
		// ACP session IDs are global to the agent, while lastSessionCwd only
		// describes the most recently selected project. Searching one cwd would
		// leave sessions from a previously selected project undeletable.
		const sessions = await SessionManager.listAll();
		const entry = sessions.find(
			(candidate) => candidate.id === params.sessionId,
		);
		if (entry && existsSync(entry.path)) unlinkSync(entry.path);
		return {};
	}

	async closeSession(params: {
		sessionId: string;
	}): Promise<Record<string, never>> {
		await this.closeRuntime(params.sessionId);
		return {};
	}

	async setSessionMode(
		params: SetSessionModeRequest,
	): Promise<SetSessionModeResponse> {
		const runtime = this.requireRuntime(params.sessionId);
		if (!thinkingLevels(runtime.session).includes(params.modeId)) {
			throw RequestError.invalidParams(`Unknown modeId: ${params.modeId}`);
		}
		runtime.session.setThinkingLevel(params.modeId as never);
		await this.conn.sessionUpdate({
			sessionId: runtime.sessionId,
			update: {
				sessionUpdate: "current_mode_update",
				currentModeId: params.modeId,
			},
		});
		return {};
	}

	async setSessionConfigOption(
		params: SetSessionConfigOptionRequest,
	): Promise<SetSessionConfigOptionResponse> {
		const runtime = this.requireRuntime(params.sessionId);
		if (params.configId === MODEL_CONFIG_ID) {
			if (typeof params.value !== "string") {
				throw RequestError.invalidParams(
					"Model config option requires a string value",
				);
			}
			await this.setModel(runtime, params.value);
		} else if (params.configId === THINKING_CONFIG_ID) {
			if (
				typeof params.value !== "string" ||
				!thinkingLevels(runtime.session).includes(params.value)
			) {
				throw RequestError.invalidParams(
					`Unknown thinking level: ${String(params.value)}`,
				);
			}
			runtime.session.setThinkingLevel(params.value as never);
		} else {
			throw RequestError.invalidParams(
				`Unknown config option: ${params.configId}`,
			);
		}
		const options = configOptions(
			await this.modelRuntimePromise,
			runtime.session,
		);
		await this.conn.sessionUpdate({
			sessionId: runtime.sessionId,
			update: { sessionUpdate: "config_option_update", configOptions: options },
		});
		return { configOptions: options };
	}

	async authenticate(): Promise<void> {
		// Pi credentials are managed by its shared auth.json; ACP authentication is
		// intentionally a no-op for the embedded runtime.
	}

	async dispose(): Promise<void> {
		await Promise.allSettled(
			[...this.sessions.keys()].map((sessionId) =>
				this.closeRuntime(sessionId),
			),
		);
	}

	private async createRuntime(options: {
		cwd: string;
		additionalDirectories: string[];
		mcpServers: McpServer[];
		meta?: Record<string, unknown> | null;
		sessionManager?: SessionManager;
		sessionId?: string;
	}): Promise<SessionRuntime> {
		const { clients, tools } = await mcpTools(options.mcpServers);
		const agentDir = getAgentDir();
		const settingsManager = SettingsManager.create(options.cwd, agentDir);
		const resourceLoader = new DefaultResourceLoader({
			cwd: options.cwd,
			agentDir,
			settingsManager,
			noExtensions: process.env[PI_DISABLE_EXTENSIONS_ENV] === "1",
			appendSystemPrompt: extractSystemInstructions(options.meta)
				? [extractSystemInstructions(options.meta) as string]
				: [],
		});
		await resourceLoader.reload();
		const ownsSessionManager = options.sessionManager === undefined;
		const sessionManager =
			options.sessionManager ?? SessionManager.create(options.cwd);
		if (ownsSessionManager) persistNewSessionMarker(sessionManager);
		const result = await createAgentSession({
			cwd: options.cwd,
			agentDir,
			modelRuntime: await this.modelRuntimePromise,
			settingsManager,
			resourceLoader,
			sessionManager,
			customTools: tools,
		});
		const session = result.session;
		const sessionId = options.sessionId ?? session.sessionId;
		if (session.sessionId !== sessionId) {
			// The ID comes from the persisted SDK session. A mismatch means the
			// caller attempted to load a different file than requested.
			await Promise.allSettled(clients.map((client) => client.close()));
			session.dispose();
			throw RequestError.invalidParams(`Session id mismatch: ${sessionId}`);
		}
		const runtime: SessionRuntime = {
			sessionId,
			cwd: options.cwd,
			additionalDirectories: options.additionalDirectories,
			mcpClients: clients,
			session,
			sessionManager,
			modelRuntime: await this.modelRuntimePromise,
			unsubscribe: () => undefined,
			eventQueue: Promise.resolve(),
			promptActive: false,
			cancelRequested: false,
		};
		runtime.unsubscribe = session.subscribe((event) => {
			runtime.eventQueue = runtime.eventQueue
				.then(() => this.handleEvent(runtime, event))
				.catch((error) => {
					console.error("[pi-sdk-acp] event mapping failed", error);
				});
		});
		await session.bindExtensions({
			mode: "rpc",
			uiContext: new AcpExtensionUiContext(this.conn, sessionId),
			abortHandler: () => {
				runtime.cancelRequested = true;
				void session.abort();
			},
		});
		this.sessions.set(sessionId, runtime);
		return runtime;
	}

	private requireRuntime(sessionId: string): SessionRuntime {
		const runtime = this.sessions.get(sessionId);
		if (!runtime)
			throw RequestError.invalidParams(`Unknown sessionId: ${sessionId}`);
		return runtime;
	}

	private assertCwd(cwd: string): void {
		if (!isAbsolute(cwd))
			throw RequestError.invalidParams(`cwd must be an absolute path: ${cwd}`);
	}

	private async closeRuntime(sessionId: string): Promise<void> {
		const runtime = this.sessions.get(sessionId);
		if (!runtime) return;
		this.sessions.delete(sessionId);
		runtime.cancelRequested = true;
		await Promise.allSettled([
			runtime.session.abort(),
			...runtime.mcpClients.map((client) => client.close()),
		]);
		runtime.unsubscribe();
		runtime.session.dispose();
	}

	private async setModel(
		runtime: SessionRuntime,
		requested: string,
	): Promise<void> {
		const modelRuntime = await this.modelRuntimePromise;
		let provider: string | undefined;
		let modelId = requested;
		const slash = requested.indexOf("/");
		if (slash > 0) {
			provider = requested.slice(0, slash);
			modelId = requested.slice(slash + 1);
		}
		if (!provider) {
			const found = modelRuntime
				.getModels()
				.find((model) => model.id === modelId);
			provider = found?.provider;
		}
		if (!provider)
			throw RequestError.invalidParams(`Unknown modelId: ${requested}`);
		const model = modelRuntime.getModel(provider, modelId);
		if (!model)
			throw RequestError.invalidParams(`Unknown modelId: ${requested}`);
		await runtime.session.setModel(model);
	}

	private async emitCommands(runtime: SessionRuntime): Promise<void> {
		await this.conn.sessionUpdate({
			sessionId: runtime.sessionId,
			update: {
				sessionUpdate: "available_commands_update",
				availableCommands: commandsFor(runtime.session),
			},
		});
	}

	private async handleBuiltinCommand(
		runtime: SessionRuntime,
		text: string,
		hasImages: boolean,
	): Promise<PromptResponse | undefined> {
		if (hasImages || !text.trimStart().startsWith("/")) return undefined;
		const [command, ...args] = text.trim().slice(1).split(/\s+/);
		if (command === "compact") {
			const result = await runtime.session.compact(args.join(" ") || undefined);
			await this.conn.sessionUpdate({
				sessionId: runtime.sessionId,
				update: {
					sessionUpdate: "agent_message_chunk",
					content: {
						type: "text",
						text: `Compaction completed.${result?.summary ? `\n\n${result.summary}` : ""}`,
					},
				},
			});
			return { stopReason: "end_turn" };
		}
		if (command === "name") {
			if (args.length > 0) runtime.session.setSessionName(args.join(" "));
			return { stopReason: "end_turn" };
		}
		if (command === "session") {
			const stats = runtime.session.getSessionStats();
			await this.conn.sessionUpdate({
				sessionId: runtime.sessionId,
				update: {
					sessionUpdate: "agent_message_chunk",
					content: {
						type: "text",
						text: `Session: ${stats.sessionId}\nMessages: ${stats.totalMessages}\nTokens: ${stats.tokens.total}`,
					},
				},
			});
			return { stopReason: "end_turn" };
		}
		return undefined;
	}

	private async handleEvent(
		runtime: SessionRuntime,
		event: AgentSessionEvent,
	): Promise<void> {
		const eventRecord = event as unknown as JsonRecord;
		if (eventRecord.type === "agent_start") {
			runtime.assistantMessageId = undefined;
			return;
		}
		if (eventRecord.type === "message_start") {
			const message = asRecord(eventRecord.message);
			if (message?.role === "assistant")
				runtime.assistantMessageId = crypto.randomUUID();
			return;
		}
		if (eventRecord.type === "message_update") {
			const stream = asRecord(eventRecord.assistantMessageEvent);
			if (!stream) return;
			const updateType = stringValue(stream.type);
			const delta = stringValue(stream.delta);
			if (!delta) return;
			if (updateType === "text_delta") {
				await this.conn.sessionUpdate({
					sessionId: runtime.sessionId,
					update: {
						sessionUpdate: "agent_message_chunk",
						messageId: runtime.assistantMessageId,
						content: { type: "text", text: delta },
					},
				});
			} else if (updateType === "thinking_delta") {
				await this.conn.sessionUpdate({
					sessionId: runtime.sessionId,
					update: {
						sessionUpdate: "agent_thought_chunk",
						messageId: runtime.assistantMessageId,
						content: { type: "text", text: delta },
					},
				});
			}
			return;
		}
		if (eventRecord.type === "tool_execution_start") {
			const toolName = stringValue(eventRecord.toolName) ?? "tool";
			const toolCallId =
				stringValue(eventRecord.toolCallId) ?? crypto.randomUUID();
			await this.conn.sessionUpdate({
				sessionId: runtime.sessionId,
				update: {
					sessionUpdate: "tool_call",
					toolCallId,
					title: toolName,
					kind: toolKind(toolName),
					status: "in_progress",
					rawInput: eventRecord.args,
					_meta: { "sh.superset/piTool": toolName },
				},
			});
			return;
		}
		if (eventRecord.type === "tool_execution_update") {
			const toolCallId = stringValue(eventRecord.toolCallId);
			if (!toolCallId) return;
			const text = contentText(eventRecord.partialResult);
			await this.conn.sessionUpdate({
				sessionId: runtime.sessionId,
				update: {
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: "in_progress",
					...(text
						? {
								content: [{ type: "content", content: { type: "text", text } }],
							}
						: {}),
				},
			});
			return;
		}
		if (eventRecord.type === "tool_execution_end") {
			const toolCallId = stringValue(eventRecord.toolCallId);
			if (!toolCallId) return;
			const text = contentText(eventRecord.result);
			const images = piToolResultImageBlocks(eventRecord.result);
			await this.conn.sessionUpdate({
				sessionId: runtime.sessionId,
				update: {
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: eventRecord.isError === true ? "failed" : "completed",
					rawOutput: eventRecord.result,
					...(text
						? {
								content: [{ type: "content", content: { type: "text", text } }],
							}
						: {}),
				},
			});
			for (const image of images) {
				await this.conn.sessionUpdate({
					sessionId: runtime.sessionId,
					update: {
						sessionUpdate: "agent_message_chunk",
						messageId: runtime.assistantMessageId,
						content: image,
					},
				});
			}
			return;
		}
		if (eventRecord.type === "message_end") {
			runtime.lastUsage =
				usageFromMessage(eventRecord.message) ?? runtime.lastUsage;
			return;
		}
		if (eventRecord.type === "agent_end") {
			runtime.lastUsage =
				usageFromStats(runtime.session.getSessionStats()) ?? runtime.lastUsage;
			const contextUsage = runtime.session.getContextUsage();
			if (
				contextUsage?.tokens !== null &&
				typeof contextUsage?.tokens === "number" &&
				typeof contextUsage.contextWindow === "number"
			) {
				await this.conn.sessionUpdate({
					sessionId: runtime.sessionId,
					update: {
						sessionUpdate: "usage_update",
						used: contextUsage.tokens,
						size: contextUsage.contextWindow,
					},
				});
			}
		}
	}

	private async replay(runtime: SessionRuntime): Promise<void> {
		for (const entry of runtime.sessionManager.getBranch()) {
			const record = asRecord(entry);
			if (record?.type !== "message") continue;
			const message = asRecord(record.message);
			if (!message) continue;
			const role = message.role;
			if (role === "user") {
				const content = message.content;
				const blocks = Array.isArray(content)
					? content
					: [{ type: "text", text: contentText(content) }];
				for (const block of blocks) {
					await this.conn.sessionUpdate({
						sessionId: runtime.sessionId,
						update: {
							sessionUpdate: "user_message_chunk",
							content: block as never,
						},
					});
				}
			} else if (role === "assistant") {
				const content = message.content;
				const blocks = Array.isArray(content)
					? content
					: [{ type: "text", text: contentText(content) }];
				for (const block of blocks) {
					const blockRecord = asRecord(block);
					if (blockRecord?.type === "thinking") {
						await this.conn.sessionUpdate({
							sessionId: runtime.sessionId,
							update: {
								sessionUpdate: "agent_thought_chunk",
								content: {
									type: "text",
									text: String(blockRecord.thinking ?? ""),
								},
							},
						});
					} else if (blockRecord?.type === "text") {
						await this.conn.sessionUpdate({
							sessionId: runtime.sessionId,
							update: {
								sessionUpdate: "agent_message_chunk",
								content: { type: "text", text: String(blockRecord.text ?? "") },
							},
						});
					}
				}
			}
		}
	}
}

function configOptionsFromRuntime(
	runtime: SessionRuntime,
): SessionConfigOption[] {
	return configOptions(runtime.modelRuntime, runtime.session);
}

export function sessionResponse(
	sessionId: string,
	configOptions: SessionConfigOption[],
	loaded = false,
): NewSessionResponse {
	return {
		sessionId,
		configOptions,
		_meta: { piAcp: { startupInfo: null, sdk: true, loaded } },
	};
}

function startAdapter(): void {
	// The SDK's OAuth loader intentionally uses a bundler-opaque dynamic import.
	// Register the static Bun-compatible loaders so desktop's Rollup bundle does
	// not depend on a sibling openai-codex.js chunk at runtime.
	registerBunOAuthFlows();
	const stream = ndJsonStream(
		Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
		Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
	);
	const connection = new AgentSideConnection(
		(conn) => new PiSdkAcpAgent(conn),
		stream,
	);
	void connection;
}

const invokedPath = process.argv[1] ?? "";
if (
	invokedPath.endsWith("/pi-acp.js") ||
	invokedPath.endsWith("/pi-sdk-acp.ts")
) {
	startAdapter();
}

export const piSdkAcpEntry = fileURLToPath(import.meta.url);
