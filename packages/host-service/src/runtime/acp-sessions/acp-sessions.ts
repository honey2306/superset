import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";
import {
	client,
	ndJsonStream,
	PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type {
	AskUserAnswer,
	AskUserArguments,
	AskUserResult,
	AvailableCommand,
	ClientConnection,
	ContentBlock,
	CreateElicitationRequest,
	CreateElicitationResponse,
	EnqueuePromptResult,
	HarnessKind,
	JsonRpcId,
	MessagesPage,
	PendingPermission,
	PermissionOption,
	PromptAccepted,
	QueuedPrompt,
	RemoteCommandFrame,
	RemoteCommandOperation,
	RemoteCommandOutcome,
	RequestPermissionOutcome,
	RequestPermissionRequest,
	RequestPermissionResponse,
	RespondToPermissionResult,
	SessionConfigOption,
	SessionModeState,
	SessionNotification,
	SessionScopedState,
	SessionStatus,
	SessionsPage,
	SessionUpdate,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
	StopReason,
	SupersetSessionRole,
	TranscriptPage,
	TranscriptTurn,
} from "@superset/session-protocol";
import {
	customResponse,
	encodeMessagesCursor,
	groupTranscriptTurns,
	SUPERSET_DELEGATED_EXECUTOR_INSTRUCTIONS,
	SUPERSET_DELEGATED_EXECUTOR_ROLE,
	SUPERSET_DELEGATION_META_KEY,
	SUPERSET_ROOT_COORDINATOR_ROLE,
	selectedOptionIds,
} from "@superset/session-protocol";
import type { AcpArtifactStore } from "./artifact-store";
import {
	orderReplayedRemoteQueue,
	replayRemoteCommands,
	SessionJournal,
} from "./journal";
import type { AcpSessionPersistence, AcpSessionRecord } from "./persistence";
import { piExtensionUiPermissionPresentation } from "./pi-extension-ui";
import type {
	AcpMergeRequestOpenRequestHandler,
	AcpSessionChangeHandler,
	AcpSessionOpenRequestHandler,
} from "./runtime";
import { buildTranscriptPageFromTurns } from "./transcript";

export class AcpSessionNotFoundError extends Error {}
export class AcpSessionDeadError extends Error {}
export class AcpWorkspaceMismatchError extends Error {}

/**
 * A `session/load` miss is special: real adapters can tear down their native
 * session input while leaving the ACP process responsive.  It is therefore
 * unsafe to issue any further request on that connection.
 */
class MissingUpstreamSessionError extends Error {
	constructor() {
		super("ACP adapter no longer has the native session");
	}
}

const CLIENT_INFO = { name: "superset-host", version: "1" };
const SKIP_TRANSCRIPT_REPLAY_META_KEY =
	"sh.superset/skipTranscriptReplay" as const;
const STDERR_TAIL_LIMIT = 8_192;
/** JSON-RPC resource-not-found, used by ACP adapters for a missing session. */
const RESOURCE_NOT_FOUND_ERROR_CODE = -32_002;
/**
 * Dead runtimes are kept around so get/getMessages can still serve their
 * journal, but only this many — beyond it the oldest are evicted outright.
 */
const MAX_DEAD_RUNTIMES = 20;
/** Frames served by getMessages pages — everything fold renders as timeline. */
const MESSAGE_FRAME_KINDS = new Set<SessionUpdateFrame["kind"]>([
	"update",
	"permission_requested",
	"permission_resolved",
	"prompt_rejected",
]);
/** Keep daemon responses comfortably below its 16 MiB NDJSON frame limit. */
const MAX_MESSAGES_PAGE_BYTES = 8 * 1024 * 1024;
/** Release an unseen, quiescent adapter after two minutes by default. */
const DEFAULT_IDLE_HIBERNATE_MS = 2 * 60 * 1_000;

function isMissingUpstreamResourceError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === RESOURCE_NOT_FOUND_ERROR_CODE
	);
}

function resolveAdapterEntry(): string {
	return resolveBundledAcpEntry(["claude-agent-acp.js"]);
}

export function resolveBundledAcpEntry(
	filenames: readonly string[],
	moduleUrl: string = import.meta.url,
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [here, path.resolve(here, "..")].flatMap((directory) =>
		filenames.map((filename) => path.join(directory, filename)),
	);
	return candidates.find(existsSync) ?? candidates[0] ?? here;
}

function resolveCodexAdapterEntry(): string {
	return resolveBundledAcpEntry(["codex-app-server-acp.js"]);
}

function resolvePiAdapterEntry(): string {
	return resolveBundledAcpEntry(["pi-acp.js", "pi-acp.mjs"]);
}

/** Pi's adapter declares its startup prelude in session/new metadata. */
function piStartupInfoFromSessionResponse(response: unknown): string | null {
	if (!response || typeof response !== "object") return null;
	const meta = (response as { _meta?: unknown })._meta;
	if (!meta || typeof meta !== "object") return null;
	const piAcp = (meta as { piAcp?: unknown }).piAcp;
	if (!piAcp || typeof piAcp !== "object") return null;
	const startupInfo = (piAcp as { startupInfo?: unknown }).startupInfo;
	return typeof startupInfo === "string" && startupInfo.length > 0
		? startupInfo
		: null;
}

/** Keep suppressing legacy Pi upgrade notices when replaying old journals. */
function isPiUpdateNotice(text: string): boolean {
	return text.startsWith("New version available:");
}

const MAX_SESSION_TITLE_LENGTH = 256;

/**
 * Same shape as claude-agent-acp's own sanitizeTitle: collapse whitespace,
 * strip newlines, and clamp to the ACP-observed title cap so a chatty model
 * cannot push a paragraph into the tab strip.
 */
function sanitizeSessionTitle(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const sanitized = raw
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!sanitized) return null;
	if (sanitized.length <= MAX_SESSION_TITLE_LENGTH) return sanitized;
	return `${sanitized.slice(0, MAX_SESSION_TITLE_LENGTH - 1)}…`;
}

function isPiTimelineUpdate(update: SessionNotification["update"]): boolean {
	return (
		update.sessionUpdate === "agent_message_chunk" ||
		update.sessionUpdate === "agent_thought_chunk" ||
		update.sessionUpdate === "tool_call" ||
		update.sessionUpdate === "tool_call_update"
	);
}

/**
 * Claude ACP renders its built-in AskUserQuestion as a tool-call update, then
 * asks the host to approve the same tool call. The permission request itself
 * has no elicitation discriminator, so retain this adapter-declared identity
 * long enough to correlate the two messages by their exact toolCallId.
 */
function isClaudeAskUserQuestion(
	update: SessionNotification["update"],
): boolean {
	if (update.sessionUpdate !== "tool_call_update") return false;
	const meta = update._meta;
	if (!meta || typeof meta !== "object") return false;
	const claudeCode = (meta as { claudeCode?: unknown }).claudeCode;
	if (!claudeCode || typeof claudeCode !== "object") return false;
	return (claudeCode as { toolName?: unknown }).toolName === "AskUserQuestion";
}

function firstPiUserMessageSeq(
	entries: SessionUpdateEnvelope[],
): number | null {
	for (const envelope of entries) {
		if (
			envelope.frame.kind === "update" &&
			envelope.frame.update.sessionUpdate === "user_message_chunk"
		) {
			return envelope.seq;
		}
	}
	return null;
}

/**
 * Legacy Pi journals may have persisted the startup prelude before the host
 * began suppressing it. Replace only those pre-user timeline updates with an
 * inert ACP update, preserving every sequence number: getMessages and stream
 * cursors therefore remain gapless across a restart.
 */
function suppressPersistedPiBootstrap(
	entries: SessionUpdateEnvelope[],
	firstUserMessageSeq: number | null,
): SessionUpdateEnvelope[] {
	const bootstrapEndsBefore = firstUserMessageSeq ?? Number.POSITIVE_INFINITY;
	return entries.map((envelope) => {
		if (
			envelope.seq >= bootstrapEndsBefore ||
			envelope.frame.kind !== "update" ||
			!isPiTimelineUpdate(envelope.frame.update)
		) {
			return envelope;
		}
		return {
			...envelope,
			frame: {
				kind: "update",
				// A title-less info update has no timeline rendering or state effect.
				update: { sessionUpdate: "session_info_update" },
			},
		};
	});
}

export interface AdapterProcessSpec {
	command: string;
	args: string[];
	usesElectronNode: boolean;
}

/** Resolve an ACP harness to its child-process contract. */
export function resolveAdapterProcess(
	harness: HarnessKind,
	options: Pick<
		AcpSessionManagerOptions,
		| "adapterEntry"
		| "codexAdapterEntry"
		| "piAdapterEntry"
		| "myflickerAdapterCommand"
		| "deepseekAdapterCommand"
		| "deepseekAdapterConfig"
	> = {},
	execPath = process.execPath,
): AdapterProcessSpec {
	switch (harness) {
		case "codex-app-server":
			return {
				command: execPath,
				args: [options.codexAdapterEntry ?? resolveCodexAdapterEntry()],
				usesElectronNode: true,
			};
		case "pi-acp":
			return {
				command: execPath,
				args: [options.piAdapterEntry ?? resolvePiAdapterEntry()],
				usesElectronNode: true,
			};
		case "myflicker-acp":
			return {
				command: options.myflickerAdapterCommand ?? "mfcli",
				// mfcli 0.3.14 has no ACP modes; its documented full-access mode
				// is a CLI flag and must precede the `acp` subcommand.
				args: ["--approval-mode", "yolo", "acp"],
				usesElectronNode: false,
			};
		case "deepseek-acp":
			return {
				command: options.deepseekAdapterCommand ?? "dsh-acp-demo",
				// `dsh-acp-demo` boots the DeepSeek Harness ACP server from a
				// cordis.yml; without a config it falls back to `./cordis.yml`
				// relative to the session cwd.
				args: options.deepseekAdapterConfig
					? ["--config", options.deepseekAdapterConfig]
					: [],
				usesElectronNode: false,
			};
		case "claude-agent-acp":
			return {
				command: execPath,
				args: [options.adapterEntry ?? resolveAdapterEntry()],
				usesElectronNode: true,
			};
	}
}

/**
 * Check an external ACP executable before creating its adapter process.
 *
 * `spawn()` reports ENOENT asynchronously, after the renderer has already
 * opened a loading pane. Looking up the executable first lets the create
 * mutation return a useful, agent-specific install hint that the pane can
 * render with Retry, without booting a potentially slow CLI just to probe it.
 */
export function assertExternalCliAvailable(
	command: string,
	displayName: string,
	installHint: string,
	env: NodeJS.ProcessEnv,
): void {
	if (!resolveExternalCliPath(command, env)) {
		throw new Error(`${displayName} CLI is unavailable. ${installHint}`);
	}
}

function resolveExternalCliPath(
	command: string,
	env: NodeJS.ProcessEnv,
): string | null {
	const trimmed = command.trim();
	if (!trimmed) return null;

	const hasPathSeparator =
		trimmed.includes("/") ||
		(process.platform === "win32" && trimmed.includes("\\"));
	if (path.isAbsolute(trimmed) || hasPathSeparator) {
		return isExecutablePath(trimmed) ? trimmed : null;
	}

	const pathValue = env.PATH ?? env.Path ?? "";
	const pathEntries = pathValue.split(path.delimiter);
	const extensions =
		process.platform === "win32"
			? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
			: [""];
	for (const directory of pathEntries) {
		for (const extension of extensions) {
			const candidate = path.join(directory, `${trimmed}${extension}`);
			if (isExecutablePath(candidate)) return candidate;
		}
	}
	return null;
}

function isExecutablePath(candidate: string): boolean {
	try {
		accessSync(
			candidate,
			process.platform === "win32" ? constants.F_OK : constants.X_OK,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * `child_process.spawn` reports an invalid cwd as an asynchronous ENOENT. In
 * practice that error names the adapter executable, which leaves callers with
 * a misleading "ACP connection closed" and can take down the daemon when no
 * child error listener has been attached yet. Validate the workspace boundary
 * before creating the child so a create request can explain what is broken.
 */
function assertWorkspaceCwd(cwd: string, workspaceId: string): void {
	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(cwd);
	} catch (error) {
		const code =
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			typeof error.code === "string"
				? error.code
				: undefined;
		const reason =
			code === "ENOENT" || code === "ENOTDIR"
				? "does not exist"
				: "is unavailable";
		throw new Error(`Workspace "${workspaceId}" cwd ${reason}: ${cwd}`, {
			cause: error,
		});
	}
	if (!stats.isDirectory()) {
		throw new Error(
			`Workspace "${workspaceId}" cwd is not a directory: ${cwd}`,
		);
	}
	try {
		accessSync(cwd, constants.R_OK | constants.X_OK);
	} catch (error) {
		throw new Error(
			`Workspace "${workspaceId}" cwd is not accessible: ${cwd}`,
			{ cause: error },
		);
	}
}

/**
 * Claude ACP intentionally relies on the user's installed Claude Code CLI.
 * The packaged bridge includes the SDK JavaScript API, but never Anthropic's
 * SDK-provided fallback binary.
 */
export function assertExternalClaudeCliAvailable(env: NodeJS.ProcessEnv): void {
	const command = env.CLAUDE_CODE_EXECUTABLE ?? "claude";
	assertExternalCliAvailable(
		command,
		"Claude Code",
		"Install Claude Code and ensure `claude` is on PATH, or set CLAUDE_CODE_EXECUTABLE to its executable path.",
		env,
	);
	// Always pin the command after a successful PATH probe. The bundled ACP
	// bridge must never ask the SDK to resolve its removed fallback binary.
	env.CLAUDE_CODE_EXECUTABLE = command;
}

/** The slice of the SDK's request handler context parkPermission needs. */
interface PermissionRequestContext {
	params: RequestPermissionRequest;
	requestId: JsonRpcId;
	signal: AbortSignal;
}

/** One AskUserQuestion-style question recovered from a form elicitation. */
interface ElicitationQuestion {
	/** The form field the chosen label is written back to (`question_<n>`). */
	fieldKey: string;
	/** The question text shown as the card title. */
	title: string;
	/** Clean option labels (each enum option's `const`). */
	labels: string[];
	/** Whether the field expects an array of labels. */
	multiSelect: boolean;
	/** Paired free-text field generated by AskUserQuestion, when present. */
	customFieldKey?: string;
}

interface CanonicalAskUserQuestion {
	question: string;
	options: Array<{ label: string; description?: string }>;
	multiSelect: boolean;
	allowsCustomResponse: boolean;
}

/**
 * Pull AskUserQuestion-style fields (`question_<n>` with enum options) out of
 * a form elicitation, in question order. A paired `question_<n>_custom` string
 * field enables a free-text answer on the same card. Single-question forms
 * carry the question text in `message`; multi-question forms put each
 * question's text in its field description.
 */
function extractElicitationQuestions(
	params: CreateElicitationRequest,
): ElicitationQuestion[] {
	const form = params as {
		message: string;
		requestedSchema?: { properties?: Record<string, unknown> };
	};
	const properties = form.requestedSchema?.properties ?? {};
	const questions: ElicitationQuestion[] = [];
	for (const [fieldKey, property] of Object.entries(properties)) {
		if (!/^question_\d+$/.test(fieldKey)) continue;
		const field = property as {
			type?: string;
			description?: string | null;
			oneOf?: Array<{ const?: unknown }>;
			items?: { anyOf?: Array<{ const?: unknown }> };
		};
		const multiSelect = field.type === "array";
		const enumOptions = (multiSelect ? field.items?.anyOf : field.oneOf) ?? [];
		const labels = enumOptions
			.map((option) => option.const)
			.filter((value): value is string => typeof value === "string");
		if (labels.length === 0) continue;
		const customFieldKey = `${fieldKey}_custom`;
		const customField = properties[customFieldKey] as
			| { type?: unknown }
			| undefined;
		questions.push({
			fieldKey,
			title: field.description ?? form.message,
			labels,
			multiSelect,
			...(customField?.type === "string" ? { customFieldKey } : {}),
		});
	}
	return questions.sort(
		(a, b) =>
			Number(a.fieldKey.slice("question_".length)) -
			Number(b.fieldKey.slice("question_".length)),
	);
}

interface AcpSessionRuntime {
	/** Mutable session-scoped state; snapshots are cloned on the way out. */
	state: SessionScopedState;
	/** Persisted Superset coordinator/executor boundary for this session. */
	role: SupersetSessionRole;
	/** The adapter's ACP session id — host-internal, never leaves this file. */
	acpSessionId: string;
	child: ChildProcess;
	connection: ClientConnection;
	journal: SessionJournal;
	subscribers: Set<(envelope: SessionUpdateEnvelope) => void>;
	/** Parked session/request_permission responses, keyed by requestId. */
	pendingResolvers: Map<string, (outcome: RequestPermissionOutcome) => void>;
	/**
	 * Tool calls whose latest journaled status is non-terminal. Turn end and
	 * adapter death terminalize whatever is left here — without that, a
	 * cancelled or crashed turn leaves rows rendering as running forever.
	 */
	openToolCalls: Set<string>;
	/** Tool calls Claude explicitly identified as its AskUserQuestion tool. */
	askUserToolCalls: Set<string>;
	/**
	 * Pi emits an informational prelude asynchronously after session/new. It is
	 * adapter bootstrap output, not part of the conversation. This opaque value
	 * comes from Pi's session/new metadata, so suppression does not depend on
	 * recognising version, skills, or project text in the renderer.
	 */
	piStartupInfo: string | null;
	/** The first host-journaled user block, used to suppress legacy Pi preludes. */
	piFirstUserMessageSeq: number | null;
	activePromptCount: number;
	/**
	 * A `sendNow` request parked while the current turn drains. When
	 * `activePromptCount` returns to zero the finally hook picks it up before
	 * any other queued prompt and fires it as a normal prompt. Never more
	 * than one — a second sendNow while one is pending replaces it, since
	 * only the most recent "cut the line" ask is meaningful.
	 */
	pendingSendNow: QueuedPrompt | null;
	stderrTail: string;
	dead: boolean;
	/** True once explicitly closed; late adapter events must not re-persist it. */
	closed: boolean;
	/**
	 * True once a title-generation request has been kicked off for this
	 * session — prevents the first prompt from starting more than one job even
	 * if the caller emits several prompts back-to-back before the first result
	 * lands.
	 */
	titleGenerationStarted: boolean;
	/** A title request keeps the adapter alive until its synthetic update lands. */
	titleGenerationInFlight: boolean;
	/** Delayed release of an idle runtime with no stream consumers. */
	idleHibernateTimer: ReturnType<typeof setTimeout> | null;
}

interface InflightCreation {
	workspaceId: string;
	promise: Promise<AcpSessionRuntime>;
}

interface TranscriptCacheEntry {
	epoch: string;
	latestSeq: number;
	turns: TranscriptTurn[];
}

export interface AcpSessionManagerOptions {
	/**
	 * Resolve a workspace id to the worktree directory its sessions run in.
	 * app.ts wires this to the workspaces table; tests pass a fixture dir.
	 */
	resolveWorkspaceCwd: (workspaceId: string) => string | Promise<string>;
	/** Per-session journal ring size (default 5,000; tests use small rings). */
	journalCapacity?: number;
	/**
	 * Absolute path of the adapter entry script the child process runs.
	 * Defaults to the real claude-agent-acp dist entry; tests inject a
	 * deterministic fake adapter speaking the same wire protocol.
	 */
	adapterEntry?: string;
	/** Test/build override for the Codex-to-ACP bridge entry point. */
	codexAdapterEntry?: string;
	/** Test/build override for the Pi-to-ACP bridge entry point. */
	piAdapterEntry?: string;
	/** Executable override for Electron-as-Node ACP adapters, primarily for tests. */
	adapterExecPath?: string;
	/** Per-manager adapter environment overrides, primarily for isolated tests. */
	adapterEnv?: Record<string, string | undefined>;
	/** Executable override for MyFlicker's native ACP server. */
	myflickerAdapterCommand?: string;
	/** Executable override for the DeepSeek Harness ACP server (`dsh-acp-demo`). */
	deepseekAdapterCommand?: string;
	/** Path to the cordis.yml the DeepSeek Harness ACP server boots from. */
	deepseekAdapterConfig?: string;
	/**
	 * Local MCP servers supplied to every ACP session setup. These are sent on
	 * both `session/new` and `session/load`, so resumed sessions keep the same
	 * tool surface regardless of the selected harness.
	 */
	mcpServers?: McpServer[];
	/** Session-scoped MCP declarations (for tools that need source identity). */
	mcpServerFactory?: (input: {
		sessionId: string;
		workspaceId: string;
		cwd: string;
		role: SupersetSessionRole;
	}) => McpServer[];
	/**
	 * Resolve instructions that must be placed in the model-facing context for
	 * a new or resumed ACP session. This is intentionally evaluated per session
	 * so a host settings change applies to the next session without restarting
	 * the daemon. Harnesses receive this through their native high-priority
	 * field when one exists, with the Superset metadata key as a bridge.
	 */
	modelFacingInstructions?: (input: {
		role: SupersetSessionRole;
	}) => string | undefined;
	/**
	 * Durable session registry. When set, every session's binding row
	 * (workspace, adapter session id, title, stop reason) is upserted on each
	 * state emit, and rows found at construction are exposed as `offline`
	 * sessions that `ensureLive` resurrects via the adapter's `session/load`.
	 * Without it the manager is memory-only (sessions die with the host).
	 */
	persistence?: AcpSessionPersistence;
	/** Stores oversized raw tool-result images outside durable journal frames. */
	artifactStore?: AcpArtifactStore;
	/**
	 * Optional Claude-Code-style tab title generator. When provided, the
	 * manager kicks it off in the background on the first user prompt of a
	 * fresh session and, when it resolves with a non-empty title, feeds a
	 * synthetic `session_info_update` through the same path as an
	 * adapter-emitted one (journal → state → subscribers → persistence).
	 * When it returns null/undefined or throws, the session simply stays
	 * titleless — the renderer falls back to the agent label.
	 */
	generateTitle?: (input: {
		sessionId: string;
		workspaceId: string;
		message: string;
	}) => Promise<string | null>;
	/**
	 * How long a session must be idle and unsubscribed before its adapter is
	 * released. `null` disables automatic hibernation; zero is useful in tests.
	 */
	idleHibernateMs?: number | null;
}

/**
 * Owns Claude Code sessions as ACP adapter child processes: one
 * `claude-agent-acp` process per session, spoken to over JSON-RPC/stdio via
 * the official SDK. Every session/update, permission request/resolution, and
 * state transition is journaled as a seq-numbered envelope (gapless, from 1)
 * and broadcast to subscribers — the WS stream and getMessages pagination
 * both read from that journal. Unsubscribed idle sessions may hibernate when
 * durable persistence is available; active and in-memory-only sessions stay
 * alive until the adapter dies or the manager is disposed. Dead sessions keep
 * their journal (list/get/getMessages still serve them) until eviction.
 *
 * With `persistence`, session binding rows survive host restarts: a restarted
 * manager lists them as `offline` (get/list are passive) and `ensureLive` —
 * called by the router and stream route before every live-path operation —
 * resurrects one on demand via the adapter's `session/load`, which replays
 * the harness-stored transcript while retaining the durable local journal.
 * Hibernation returns a live runtime to that same offline form, releasing its
 * adapter process and in-memory journal without deleting durable session data.
 * The registry epoch scopes every cursor, so a recreated journal cannot be
 * mistaken for a continuation with the same numeric sequence.
 */
export class AcpSessionManager {
	private readonly resolveWorkspaceCwd: AcpSessionManagerOptions["resolveWorkspaceCwd"];
	private readonly journalCapacity: number;
	private readonly adapterEntry: string | undefined;
	private readonly codexAdapterEntry: string | undefined;
	private readonly piAdapterEntry: string | undefined;
	private readonly adapterExecPath: string | undefined;
	private readonly adapterEnv: Record<string, string | undefined>;
	private readonly myflickerAdapterCommand: string | undefined;
	private readonly deepseekAdapterCommand: string | undefined;
	private readonly deepseekAdapterConfig: string | undefined;
	private readonly mcpServers: McpServer[];
	private readonly mcpServerFactory: AcpSessionManagerOptions["mcpServerFactory"];
	private readonly modelFacingInstructions:
		| AcpSessionManagerOptions["modelFacingInstructions"]
		| undefined;
	private readonly persistence: AcpSessionPersistence | undefined;
	private readonly artifactStore: AcpArtifactStore | undefined;
	private readonly generateTitle:
		| AcpSessionManagerOptions["generateTitle"]
		| undefined;
	private readonly idleHibernateMs: number | null;
	private readonly runtimes = new Map<string, AcpSessionRuntime>();
	private readonly creations = new Map<string, InflightCreation>();
	private readonly transcriptCache = new Map<string, TranscriptCacheEntry>();
	/** Command ids for queued prompts are carried into the eventual prompt. */
	private readonly queuedCommandIds = new Map<string, string>();
	/** Command ids parked by sendNow until the current turn settles. */
	private readonly pendingSendNowCommandIds = new Map<string, string>();
	/**
	 * Sessions known from the persisted registry with no adapter process
	 * attached. Seeded once at construction; entries leave only by successful
	 * resurrection. Disjoint from `runtimes` by construction.
	 */
	private readonly offline = new Map<string, AcpSessionRecord>();
	/**
	 * Host-wide listeners for session status transitions. Fed by `emitState`
	 * and `close`; consumed by the daemon-entry to fan out over the daemon
	 * socket, and by in-process host-service tests. Kept intentionally
	 * minimal — just `{workspaceId, sessionId, status?, eventType}` — so the
	 * sidebar-style consumers do not require a per-session subscription.
	 */
	private readonly sessionChangeListeners = new Set<AcpSessionChangeHandler>();

	constructor(options: AcpSessionManagerOptions) {
		this.resolveWorkspaceCwd = options.resolveWorkspaceCwd;
		const journalCapacity = options.journalCapacity ?? 5_000;
		if (!Number.isInteger(journalCapacity) || journalCapacity < 1) {
			throw new Error(
				`journal capacity must be a positive integer: ${journalCapacity}`,
			);
		}
		this.journalCapacity = journalCapacity;
		this.adapterEntry = options.adapterEntry;
		this.codexAdapterEntry = options.codexAdapterEntry;
		this.piAdapterEntry = options.piAdapterEntry;
		this.adapterExecPath = options.adapterExecPath;
		this.adapterEnv = options.adapterEnv ?? {};
		this.myflickerAdapterCommand = options.myflickerAdapterCommand;
		this.deepseekAdapterCommand = options.deepseekAdapterCommand;
		this.deepseekAdapterConfig = options.deepseekAdapterConfig;
		this.mcpServers = options.mcpServers ?? [];
		this.mcpServerFactory = options.mcpServerFactory;
		this.modelFacingInstructions = options.modelFacingInstructions;
		this.persistence = options.persistence;
		this.artifactStore = options.artifactStore;
		this.generateTitle = options.generateTitle;
		const idleHibernateMs =
			options.idleHibernateMs ?? DEFAULT_IDLE_HIBERNATE_MS;
		if (
			options.idleHibernateMs !== null &&
			(!Number.isFinite(idleHibernateMs) || idleHibernateMs < 0)
		) {
			throw new Error(
				`idle hibernate delay must be a non-negative finite number or null: ${idleHibernateMs}`,
			);
		}
		this.idleHibernateMs =
			options.idleHibernateMs === null ? null : idleHibernateMs;
		if (this.persistence) {
			try {
				for (const record of this.persistence.loadAll()) {
					this.offline.set(record.sessionId, record);
				}
			} catch (error) {
				console.warn(
					"[acp-sessions] failed to load persisted session registry",
					error,
				);
			}
		}
	}

	/**
	 * Idempotent create: returns the existing session's state when the id is
	 * already live (or dead) and bound to the same workspace.
	 */
	async create(input: {
		sessionId: string;
		workspaceId: string;
		harness?: HarnessKind;
		/**
		 * Client-preferred model id. Applied via `session/set_config_option`
		 * right after `session/new` when the adapter exposes a `model` select
		 * option. Only meaningful on a fresh create — a resurrected session keeps
		 * whatever model it was persisted with.
		 */
		model?: string;
		/**
		 * Require the fresh adapter session to expose and accept `model`. Normal
		 * interactive launches stay lenient; delegated execution enables this so
		 * it never reports a configured model while silently using the default.
		 */
		strictModel?: boolean;
		/** Root sessions coordinate; delegated children execute a handoff. */
		role?: SupersetSessionRole;
	}): Promise<SessionScopedState> {
		if (input.strictModel && !input.model) {
			throw new Error("Strict ACP model selection requires a model id");
		}
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
			input.harness ?? "claude-agent-acp",
			input.model,
			input.strictModel ?? false,
			input.role,
		);
		return this.snapshotState(runtime);
	}

	get(sessionId: string): SessionScopedState {
		const runtime = this.runtimes.get(sessionId);
		if (runtime) return this.snapshotState(runtime);
		const record = this.offline.get(sessionId);
		if (record) return this.offlineState(record);
		throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
	}

	/** Return the persisted coordinator/executor role for host-owned callers. */
	getRole(sessionId: string): SupersetSessionRole {
		const runtime = this.runtimes.get(sessionId);
		if (runtime) return runtime.role;
		return this.offline.get(sessionId)?.role ?? SUPERSET_ROOT_COORDINATOR_ROLE;
	}

	/**
	 * Resurrect a persisted-but-offline session before a live-path call: spawn
	 * a fresh adapter and `session/load` the stored transcript back into a new
	 * journal. Live and dead runtimes pass through untouched — dead sessions
	 * stay dead within a host lifetime (read-only journal) and only become
	 * resurrectable after a restart turns them offline. Unknown ids are a
	 * no-op so the sync call that follows raises its usual NotFound. Failed
	 * loads leave the record offline and propagate the adapter's error.
	 */
	async ensureLive(sessionId: string): Promise<void> {
		if (this.runtimes.has(sessionId)) return;
		const record = this.offline.get(sessionId);
		if (!record) return;
		await this.resurrectRuntime(record);
	}

	/**
	 * Sessions newest first — dead ones included (a crashed session's
	 * transcript, and the error that killed it, must stay discoverable until
	 * the graveyard evicts it) and offline ones too (persisted rows from
	 * before a host restart, resurrectable on demand); clients read the
	 * status off the state. The cursor is `<createdAt>:<sessionId>` (the
	 * previous page's last row) — a sort position, not an id, so pagination
	 * resumes correctly even if that session was evicted between pages.
	 */
	list(input: {
		workspaceId?: string;
		cursor?: string;
		limit?: number;
	}): SessionsPage {
		const limit = input.limit ?? 50;
		const states = [
			...[...this.runtimes.values()].map((runtime) =>
				this.snapshotState(runtime),
			),
			...[...this.offline.values()]
				.filter((record) => !this.runtimes.has(record.sessionId))
				.map((record) => this.offlineState(record)),
		]
			.filter(
				(state) =>
					!input.workspaceId || state.workspaceId === input.workspaceId,
			)
			.sort(
				(a, b) =>
					b.createdAt - a.createdAt || a.sessionId.localeCompare(b.sessionId),
			);
		let start = 0;
		if (input.cursor) {
			const separator = input.cursor.indexOf(":");
			const createdAt = Number(input.cursor.slice(0, separator));
			const sessionId = input.cursor.slice(separator + 1);
			if (Number.isFinite(createdAt)) {
				// First session strictly after the cursor position in sort order.
				start = states.findIndex(
					(state) =>
						state.createdAt < createdAt ||
						(state.createdAt === createdAt &&
							state.sessionId.localeCompare(sessionId) > 0),
				);
				if (start === -1) start = states.length;
			}
		}
		const page = states.slice(start, start + limit);
		const last = page[page.length - 1];
		return {
			items: page,
			nextCursor:
				last && start + limit < states.length
					? `${last.createdAt}:${last.sessionId}`
					: null,
			// Reaching the manager at all means the feature gate is open — the
			// router answers `enabled: false` itself when the gate is closed.
			enabled: true,
		};
	}

	/** Journal page of timeline frames, walked backwards from `beforeSeq`. */
	getMessages(input: {
		sessionId: string;
		beforeSeq?: number;
		limit?: number;
	}): MessagesPage {
		const runtime = this.runtimes.get(input.sessionId);
		const journal = runtime
			? runtime.journal
			: this.offlineJournal(input.sessionId);
		const page = journal.page({
			beforeSeq: input.beforeSeq,
			limit: input.limit ?? 50,
			matches: (envelope) => MESSAGE_FRAME_KINDS.has(envelope.frame.kind),
			maxBytes: MAX_MESSAGES_PAGE_BYTES,
			measure: (envelope) => Buffer.byteLength(JSON.stringify(envelope)),
		});
		return {
			items: page.items,
			nextCursor:
				page.nextBeforeSeq === null
					? null
					: encodeMessagesCursor(page.nextBeforeSeq),
		};
	}

	/** Semantic transcript page; turns never split across raw envelope boundaries. */
	getTranscript(input: {
		sessionId: string;
		cursor?: string;
		targetTurn?: number;
		limit?: number;
	}): TranscriptPage {
		const runtime = this.runtimes.get(input.sessionId);
		const cached = this.transcriptCache.get(input.sessionId);
		let entries: SessionUpdateEnvelope[];
		let epoch: string;
		if (runtime) {
			epoch = runtime.journal.epoch;
			if (
				cached?.epoch === epoch &&
				cached.latestSeq === runtime.journal.latestSeq
			) {
				return buildTranscriptPageFromTurns(cached.turns, input);
			}
			entries =
				this.persistence?.loadJournal(input.sessionId, epoch) ??
				runtime.journal.snapshot();
		} else {
			const record = this.offline.get(input.sessionId);
			if (!record) {
				throw new AcpSessionNotFoundError(
					`Unknown ACP session: ${input.sessionId}`,
				);
			}
			epoch = record.epoch;
			if (cached?.epoch === epoch) {
				return buildTranscriptPageFromTurns(cached.turns, input);
			}
			entries =
				this.persistence?.loadJournal(input.sessionId, epoch) ??
				this.offlineJournal(input.sessionId).snapshot();
		}
		const latestSeq = entries.at(-1)?.seq ?? 0;
		if (cached?.epoch === epoch && cached.latestSeq === latestSeq) {
			return buildTranscriptPageFromTurns(cached.turns, input);
		}
		const turns = groupTranscriptTurns(entries);
		this.transcriptCache.set(input.sessionId, { epoch, latestSeq, turns });
		return buildTranscriptPageFromTurns(turns, input);
	}

	/**
	 * Starts a turn and acks admission. A turn can block on human permission
	 * decisions for minutes-to-hours — longer than any buffered relay HTTP
	 * request survives — so remote callers must never long-poll on turn end;
	 * completion (stop reason, errors) lands in journaled state frames. The
	 * returned `turn` promise is for in-process callers (tests) only.
	 */
	prompt(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): {
		accepted: true;
		turn: Promise<{ stopReason: StopReason }>;
	} {
		if (!input.commandId) return this.promptInternal(input, false);
		const runtime = this.requireLive(input.sessionId);
		const enqueuedAt = Date.now();
		const reserved = this.reserveAndJournalRemoteCommand(runtime, {
			commandId: input.commandId,
			operation: "prompt",
			status: "queued",
			prompt: [...input.prompt],
			queueId: input.commandId,
			enqueuedAt,
		});
		if (!reserved) {
			return {
				accepted: true,
				turn: Promise.resolve({ stopReason: "end_turn" }),
			};
		}
		this.journalRemoteCommand(runtime, {
			commandId: input.commandId,
			operation: "prompt",
			status: "started",
			prompt: [...input.prompt],
			queueId: input.commandId,
			enqueuedAt,
		});
		const accepted = this.promptInternal(input, true);
		this.finishRemoteCommand(
			runtime,
			input.commandId,
			"prompt",
			input.prompt,
			input.commandId,
			enqueuedAt,
			"admitted",
		);
		return accepted;
	}

	private promptInternal(
		input: {
			sessionId: string;
			commandId?: string;
			prompt: ContentBlock[];
		},
		commandAlreadyReserved: boolean,
	): {
		accepted: true;
		turn: Promise<{ stopReason: StopReason }>;
	} {
		const runtime = this.requireLive(input.sessionId);
		if (
			input.commandId &&
			this.persistence &&
			!commandAlreadyReserved &&
			!this.persistence.reserveCommand(input.sessionId, input.commandId)
		) {
			// The original admission is durable. A retry can safely return the
			// same acknowledgement without duplicating the harness prompt.
			return {
				accepted: true,
				turn: Promise.resolve({ stopReason: "end_turn" }),
			};
		}
		// The adapter does not echo the prompt back as user_message_chunk
		// updates, so journal the user's message here — otherwise it is
		// invisible to every subscriber and to history replay. Journaled
		// synchronously before session/prompt so it always precedes the
		// agent's output in seq order.
		let promptStartSeq = 0;
		for (const block of input.prompt) {
			const envelope = this.journalFrame(runtime, {
				kind: "update",
				update: { sessionUpdate: "user_message_chunk", content: block },
				...(input.commandId ? { commandId: input.commandId } : {}),
			});
			if (promptStartSeq === 0) {
				promptStartSeq = envelope.seq;
				if (
					runtime.state.harness === "pi-acp" &&
					runtime.piFirstUserMessageSeq === null
				) {
					runtime.piFirstUserMessageSeq = envelope.seq;
				}
			}
		}
		this.maybeStartTitleGeneration(runtime, input.prompt);
		// A fresh turn starts with a clean terminal-state slate. A rejected turn
		// must not inherit the previous successful turn's stop reason.
		runtime.state.lastError = null;
		runtime.state.lastStopReason = null;
		runtime.activePromptCount += 1;
		this.syncStatus(runtime, { force: true });
		const turn = runtime.connection.agent
			.request("session/prompt", {
				sessionId: runtime.acpSessionId,
				prompt: input.prompt,
			})
			.then((response) => {
				runtime.state.lastStopReason = response.stopReason;
				runtime.state.lastCompletedAt = Date.now();
				return { stopReason: response.stopReason };
			})
			.catch((error: unknown) => {
				if (input.commandId && !runtime.closed && !commandAlreadyReserved) {
					// Admission failed, so a later retry must be allowed to try again.
					// While the turn is live the durable reservation suppresses dupes.
					this.persistence?.releaseCommand(input.sessionId, input.commandId);
				}
				const reason = error instanceof Error ? error.message : String(error);
				if (!runtime.dead && !runtime.closed) {
					runtime.state.lastError = reason;
					// The user's message is already journaled and looks delivered —
					// this frame lets fold mark it failed on every client. A permanent
					// close has already removed this session's durable rows, so late
					// transport rejection must not recreate an orphan journal row.
					this.journalFrame(runtime, {
						kind: "prompt_rejected",
						reason,
						promptStartSeq,
					});
				}
				throw error;
			})
			.finally(() => {
				runtime.activePromptCount -= 1;
				if (runtime.closed) return;
				// Whatever never reached a terminal status this turn (cancelled,
				// errored) must not keep rendering as running on every client.
				if (runtime.activePromptCount === 0) {
					this.terminalizeOpenToolCalls(runtime);
				}
				// Force an emit so every turn end lands a state frame with the
				// final lastStopReason / lastError even if the status is unchanged.
				this.syncStatus(runtime, { force: true });
				// Drain the follow-up queue: whichever prompt is next (a pending
				// sendNow beats the ordered tail) fires as if the user had just
				// typed it. Its own finally hook keeps the chain going.
				if (runtime.activePromptCount === 0) {
					this.drainQueue(runtime);
				}
			});
		// Detached callers (the router) drop `turn`; keep its rejection handled.
		turn.catch(() => {});
		return { accepted: true, turn };
	}

	/**
	 * Append a follow-up prompt for whenever the current turn (and any
	 * already-queued prompts) finishes. If nothing is in flight, drains
	 * immediately so `enqueue → nothing running` still feels like `prompt`.
	 */
	enqueuePrompt(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): EnqueuePromptResult {
		const runtime = this.requireLive(input.sessionId);
		const queued: QueuedPrompt = {
			queueId: input.commandId ?? randomUUID(),
			prompt: [...input.prompt],
			enqueuedAt: Date.now(),
		};
		if (input.commandId) {
			const reserved = this.reserveAndJournalRemoteCommand(runtime, {
				commandId: input.commandId,
				operation: "enqueuePrompt",
				status: "queued",
				prompt: [...queued.prompt],
				queueId: queued.queueId,
				enqueuedAt: queued.enqueuedAt,
			});
			if (!reserved) return { queueId: input.commandId };
		}
		runtime.state.queuedPrompts.push(queued);
		if (input.commandId) {
			this.queuedCommandIds.set(
				`${input.sessionId}:${queued.queueId}`,
				input.commandId,
			);
		}
		this.emitState(runtime);
		if (runtime.activePromptCount === 0 && !runtime.pendingSendNow) {
			this.drainQueue(runtime);
		}
		return { queueId: queued.queueId };
	}

	/**
	 * Cancel the running turn (if any) and run this prompt immediately. Works
	 * for every adapter: the standard `session/cancel` notification stops the
	 * in-flight turn's stopReason to `cancelled`, and the queue drain hook
	 * picks up the parked prompt before any other queued item. Called with an
	 * idle session behaves like a normal `prompt`.
	 */
	async sendNow(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): Promise<PromptAccepted> {
		const runtime = this.requireLive(input.sessionId);
		if (
			input.commandId &&
			this.pendingSendNowCommandIds.get(input.sessionId) === input.commandId
		) {
			return { accepted: true };
		}
		if (runtime.activePromptCount === 0) {
			const enqueuedAt = Date.now();
			if (input.commandId) {
				const reserved = this.reserveAndJournalRemoteCommand(runtime, {
					commandId: input.commandId,
					operation: "sendNow",
					status: "queued",
					prompt: [...input.prompt],
					queueId: input.commandId,
					enqueuedAt,
				});
				if (!reserved) return { accepted: true };
				this.journalRemoteCommand(runtime, {
					commandId: input.commandId,
					operation: "sendNow",
					status: "started",
					prompt: [...input.prompt],
					queueId: input.commandId,
					enqueuedAt,
				});
			}
			this.promptInternal(input, input.commandId !== undefined);
			if (input.commandId) {
				this.finishRemoteCommand(
					runtime,
					input.commandId,
					"sendNow",
					input.prompt,
					input.commandId,
					enqueuedAt,
					"admitted",
				);
			}
			return { accepted: true };
		}
		const parkedPrompt: QueuedPrompt = {
			queueId: input.commandId ?? randomUUID(),
			prompt: [...input.prompt],
			enqueuedAt: Date.now(),
		};
		if (input.commandId) {
			const reserved = this.reserveAndJournalRemoteCommand(runtime, {
				commandId: input.commandId,
				operation: "sendNow",
				status: "queued",
				prompt: [...parkedPrompt.prompt],
				queueId: parkedPrompt.queueId,
				enqueuedAt: parkedPrompt.enqueuedAt,
			});
			if (!reserved) return { accepted: true };
		}
		const previousCommandId = this.pendingSendNowCommandIds.get(
			input.sessionId,
		);
		if (previousCommandId && previousCommandId !== input.commandId) {
			const previousPrompt = runtime.pendingSendNow;
			this.finishRemoteCommand(
				runtime,
				previousCommandId,
				"sendNow",
				previousPrompt?.prompt ?? [],
				previousPrompt?.queueId ?? previousCommandId,
				previousPrompt?.enqueuedAt ?? parkedPrompt.enqueuedAt,
				"superseded",
			);
		}
		runtime.pendingSendNow = parkedPrompt;
		if (input.commandId) {
			this.pendingSendNowCommandIds.set(input.sessionId, input.commandId);
		}
		// The user asked to "cut the line" — cancel the current turn. The
		// prompt-settle hook will fire pendingSendNow before any tail item.
		try {
			await this.cancel({ sessionId: input.sessionId });
		} catch (error) {
			// A newer sendNow may have replaced this parked prompt while cancel was
			// in flight. Only roll back the prompt and map entry owned by this call;
			// otherwise the older failure would erase the newer accepted command.
			if (runtime.pendingSendNow === parkedPrompt) {
				runtime.pendingSendNow = null;
				if (
					input.commandId &&
					this.pendingSendNowCommandIds.get(input.sessionId) === input.commandId
				) {
					this.pendingSendNowCommandIds.delete(input.sessionId);
				}
			}
			if (input.commandId) {
				this.finishRemoteCommand(
					runtime,
					input.commandId,
					"sendNow",
					parkedPrompt.prompt,
					parkedPrompt.queueId,
					parkedPrompt.enqueuedAt,
					"failed",
				);
				this.persistence?.releaseCommand(input.sessionId, input.commandId);
			}
			throw error;
		}
		return { accepted: true };
	}

	/**
	 * Publish a host-owned, provider-neutral ACP plan for a live session.
	 *
	 * The caller supplies only the source session id resolved by the MCP
	 * controller; this method deliberately uses requireLive so an offline or
	 * dead session cannot receive a plan update. journalFrame is the single
	 * journal/persistence/subscriber fan-out path used by adapter updates too.
	 */
	updatePlan(input: {
		sessionId: string;
		entries: Array<{
			content: string;
			status: "pending" | "in_progress" | "completed";
		}>;
		explanation?: string;
	}): SessionUpdateEnvelope {
		const runtime = this.requireLive(input.sessionId);
		const update: Extract<SessionUpdate, { sessionUpdate: "plan" }> = {
			sessionUpdate: "plan",
			entries: input.entries.map((entry) => ({
				content: entry.content,
				status: entry.status,
				priority: "medium" as const,
			})),
			...(input.explanation
				? {
						_meta: {
							"sh.superset/updatePlanExplanation": input.explanation,
						},
					}
				: {}),
		};
		return this.journalFrame(runtime, { kind: "update", update });
	}

	removeQueuedPrompt(input: { sessionId: string; queueId: string }): void {
		const runtime = this.requireLive(input.sessionId);
		const removed = runtime.state.queuedPrompts.find(
			(entry) => entry.queueId === input.queueId,
		);
		const before = runtime.state.queuedPrompts.length;
		runtime.state.queuedPrompts = runtime.state.queuedPrompts.filter(
			(entry) => entry.queueId !== input.queueId,
		);
		if (runtime.state.queuedPrompts.length !== before) {
			const commandId = this.queuedCommandIds.get(
				`${input.sessionId}:${input.queueId}`,
			);
			if (commandId && removed) {
				this.finishRemoteCommand(
					runtime,
					commandId,
					"enqueuePrompt",
					removed.prompt,
					removed.queueId,
					removed.enqueuedAt,
					"removed",
				);
			}
			this.queuedCommandIds.delete(`${input.sessionId}:${input.queueId}`);
			this.emitState(runtime);
		}
	}

	reorderQueue(input: { sessionId: string; orderedIds: string[] }): void {
		const runtime = this.requireLive(input.sessionId);
		const current = runtime.state.queuedPrompts;
		if (input.orderedIds.length !== current.length) {
			throw new Error(
				`reorderQueue expected ${current.length} ids, got ${input.orderedIds.length}`,
			);
		}
		const byId = new Map(current.map((entry) => [entry.queueId, entry]));
		const seen = new Set<string>();
		const next: QueuedPrompt[] = [];
		for (const id of input.orderedIds) {
			if (seen.has(id)) throw new Error(`reorderQueue duplicate id: ${id}`);
			const entry = byId.get(id);
			if (!entry) throw new Error(`reorderQueue unknown queueId: ${id}`);
			seen.add(id);
			next.push(entry);
		}
		runtime.state.queuedPrompts = next;
		this.emitState(runtime);
	}

	editQueuedPrompt(input: {
		sessionId: string;
		queueId: string;
		prompt: ContentBlock[];
	}): void {
		const runtime = this.requireLive(input.sessionId);
		const entry = runtime.state.queuedPrompts.find(
			(item) => item.queueId === input.queueId,
		);
		if (!entry) return;
		entry.prompt = [...input.prompt];
		const commandId = this.queuedCommandIds.get(
			`${input.sessionId}:${input.queueId}`,
		);
		if (commandId) {
			this.journalRemoteCommand(runtime, {
				commandId,
				operation: "enqueuePrompt",
				status: "queued",
				prompt: [...entry.prompt],
				queueId: entry.queueId,
				enqueuedAt: entry.enqueuedAt,
			});
		}
		this.emitState(runtime);
	}

	clearQueue(input: { sessionId: string }): void {
		const runtime = this.requireLive(input.sessionId);
		if (runtime.state.queuedPrompts.length === 0 && !runtime.pendingSendNow) {
			return;
		}
		for (const queued of runtime.state.queuedPrompts) {
			const commandId = this.queuedCommandIds.get(
				`${input.sessionId}:${queued.queueId}`,
			);
			if (commandId) {
				this.finishRemoteCommand(
					runtime,
					commandId,
					"enqueuePrompt",
					queued.prompt,
					queued.queueId,
					queued.enqueuedAt,
					"cleared",
				);
			}
			this.queuedCommandIds.delete(`${input.sessionId}:${queued.queueId}`);
		}
		const pendingCommandId = this.pendingSendNowCommandIds.get(input.sessionId);
		if (pendingCommandId && runtime.pendingSendNow) {
			this.finishRemoteCommand(
				runtime,
				pendingCommandId,
				"sendNow",
				runtime.pendingSendNow.prompt,
				runtime.pendingSendNow.queueId,
				runtime.pendingSendNow.enqueuedAt,
				"cleared",
			);
		}
		runtime.state.queuedPrompts = [];
		this.pendingSendNowCommandIds.delete(input.sessionId);
		runtime.pendingSendNow = null;
		this.emitState(runtime);
	}

	/**
	 * Shift the next queued prompt (pendingSendNow first) into a fresh turn.
	 * Called from the prompt-settle hook and from `enqueuePrompt` when the
	 * session was already idle.
	 */
	private drainQueue(runtime: AcpSessionRuntime): void {
		if (runtime.closed || runtime.dead) return;
		if (runtime.activePromptCount > 0) return;
		const pending = runtime.pendingSendNow;
		let next: QueuedPrompt | null = null;
		if (pending) {
			next = pending;
			runtime.pendingSendNow = null;
		} else if (runtime.state.queuedPrompts.length > 0) {
			next = runtime.state.queuedPrompts[0] ?? null;
			runtime.state.queuedPrompts = runtime.state.queuedPrompts.slice(1);
		}
		if (!next) return;
		const commandKey = `${runtime.state.sessionId}:${next.queueId}`;
		const commandId = pending
			? this.pendingSendNowCommandIds.get(runtime.state.sessionId)
			: this.queuedCommandIds.get(commandKey);
		const operation: RemoteCommandOperation = pending
			? "sendNow"
			: "enqueuePrompt";
		if (pending) {
			this.pendingSendNowCommandIds.delete(runtime.state.sessionId);
		} else {
			this.queuedCommandIds.delete(commandKey);
		}
		if (commandId) {
			this.journalRemoteCommand(runtime, {
				commandId,
				operation,
				status: "started",
				prompt: [...next.prompt],
				queueId: next.queueId,
				enqueuedAt: next.enqueuedAt,
			});
		}
		this.emitState(runtime);
		// `prompt` is fire-and-forget from here; its own finally hook keeps
		// draining down the chain. Detach on the microtask queue so a synchronous
		// caller (the prompt-settle finally hook) doesn't re-enter `prompt` while
		// its own frame is still on the stack — which would layer `activePromptCount`
		// bookkeeping in the wrong order.
		queueMicrotask(() => {
			try {
				this.promptInternal(
					{
						sessionId: runtime.state.sessionId,
						prompt: next.prompt,
						...(commandId ? { commandId } : {}),
					},
					commandId !== undefined,
				);
				if (commandId) {
					this.finishRemoteCommand(
						runtime,
						commandId,
						operation,
						next.prompt,
						next.queueId,
						next.enqueuedAt,
						"admitted",
					);
				}
			} catch (error) {
				// The session may have gone offline / dead between settle and drain.
				// Keep the started frame unfinished: if the Host crashes after this
				// boundary and before the command-tagged user update, replay restores
				// the exact prompt instead of losing it.
				console.warn("[acp-sessions] queue drain skipped", error);
			}
		});
	}

	/** Ask the user through the same host-owned question engine as ACP elicitations. */
	async askUser(input: {
		sessionId: string;
		questions: AskUserArguments["questions"];
		signal?: AbortSignal;
	}): Promise<AskUserResult> {
		const runtime = this.requireLive(input.sessionId);
		const toolCallId = `elicitation-${randomUUID()}`;
		const result = await this.runAskUserQuestions(
			runtime,
			input.questions.map((question) => ({
				question: question.question,
				options: question.options,
				multiSelect: question.multiSelect,
				allowsCustomResponse: question.allowCustomResponse,
			})),
			{ toolCallId, signal: input.signal },
		);
		if (!runtime.closed) {
			this.journalFrame(runtime, {
				kind: "update",
				update: {
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: result.action === "answered" ? "completed" : "failed",
				},
			});
		}
		return result;
	}

	/** First answer wins; later answers to the same request are reported stale. */
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}): RespondToPermissionResult {
		// requireLive: a dead session should error loudly, not report the
		// (auto-cancelled) request as merely "already_resolved".
		const runtime = this.requireLive(input.sessionId);
		return this.settlePermission(runtime, input.requestId, input.outcome)
			? { status: "resolved" }
			: { status: "already_resolved" };
	}

	async cancel(input: { sessionId: string }): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		// ACP: a client cancelling the turn must answer outstanding permission
		// requests as cancelled — the adapter won't re-ask for them.
		for (const requestId of [...runtime.pendingResolvers.keys()]) {
			this.settlePermission(runtime, requestId, { outcome: "cancelled" });
		}
		await runtime.connection.agent.notify("session/cancel", {
			sessionId: runtime.acpSessionId,
		});
	}

	/**
	 * Permanently close a session. Unlike `cancel`, this tears down the adapter
	 * and removes every durable row, so the session cannot appear in Recent or
	 * be resurrected after a host restart.
	 */
	async close(input: { sessionId: string }): Promise<void> {
		const { sessionId } = input;
		const creation = this.creations.get(sessionId);
		if (creation) await creation.promise;

		const runtime = this.runtimes.get(sessionId);
		const offline = this.offline.get(sessionId);
		if (!runtime && !offline) {
			throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
		}
		const workspaceId = runtime?.state.workspaceId ?? offline?.workspaceId;
		// Deleting durable state is the commit point for a permanent close. It is
		// synchronous (SQLite transaction), so if it fails we have not yet marked
		// the runtime closed, killed its child, or removed it from memory. The
		// renderer can keep the pane visible and safely offer the user a retry.
		this.persistence?.deleteSession(sessionId);

		if (runtime) {
			this.clearIdleHibernate(runtime);
			// Stop accepting late adapter notifications before closing its transport:
			// `abort`/`exit` handlers otherwise mark the runtime dead and re-upsert
			// the registry row after persistence has deleted it.
			runtime.closed = true;
			for (const resolver of runtime.pendingResolvers.values()) {
				resolver({ outcome: "cancelled" });
			}
			runtime.pendingResolvers.clear();
			runtime.state.pendingPermissions = [];
			for (const queued of runtime.state.queuedPrompts) {
				this.queuedCommandIds.delete(`${sessionId}:${queued.queueId}`);
			}
			this.pendingSendNowCommandIds.delete(sessionId);
			runtime.state.queuedPrompts = [];
			runtime.pendingSendNow = null;
			try {
				await runtime.connection.agent.notify("session/cancel", {
					sessionId: runtime.acpSessionId,
				});
			} catch {
				// The process is about to be terminated, so a broken ACP transport
				// cannot prevent explicit session disposal.
			}
			try {
				runtime.connection.close();
			} catch {
				// best-effort — it may already be disconnected
			}
			try {
				runtime.child.kill();
			} catch {
				// best-effort — it may already have exited
			}
			this.runtimes.delete(sessionId);
		}

		this.offline.delete(sessionId);
		this.artifactStore?.removeSession(sessionId);
		if (workspaceId) {
			this.notifySessionChange({
				sessionId,
				workspaceId,
				eventType: "deleted",
				occurredAt: Date.now(),
			});
		}
	}

	async setMode(input: { sessionId: string; modeId: string }): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		await runtime.connection.agent.request("session/set_mode", {
			sessionId: runtime.acpSessionId,
			modeId: input.modeId,
		});
		// The adapter acks set_mode with an empty response and only notifies
		// config_option_update (never current_mode_update) for client-initiated
		// switches, so currentMode is applied here from the request itself.
		if (runtime.state.currentMode) {
			runtime.state.currentMode = {
				...runtime.state.currentMode,
				currentModeId: input.modeId,
			};
			this.emitState(runtime);
		}
	}

	async setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		const response = await runtime.connection.agent.request(
			"session/set_config_option",
			typeof input.value === "boolean"
				? {
						sessionId: runtime.acpSessionId,
						configId: input.configId,
						value: input.value,
						type: "boolean",
					}
				: {
						sessionId: runtime.acpSessionId,
						configId: input.configId,
						value: input.value,
					},
		);
		// The refreshed catalog rides the response — the adapter emits no
		// config_option_update notification for client-initiated changes.
		runtime.state.configOptions = response.configOptions;
		this.emitState(runtime);
	}

	/**
	 * Attach a live envelope listener. With `since`, the retained journal tail
	 * `(since, latest]` is replayed synchronously first; if part of that range
	 * was evicted a single `reset` frame is delivered instead and the caller
	 * must resync (get + getMessages) before subscribing again. Without
	 * `since`, the stream starts live from now. Returns the unsubscribe.
	 */
	subscribe(input: {
		sessionId: string;
		since?: number;
		epoch?: string;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): () => void {
		const runtime = this.require(input.sessionId);
		const { onEnvelope } = input;
		if (input.epoch !== undefined && input.epoch !== runtime.journal.epoch) {
			onEnvelope({
				seq: runtime.journal.latestSeq,
				epoch: runtime.journal.epoch,
				sessionId: runtime.state.sessionId,
				ts: Date.now(),
				frame: { kind: "reset", reason: "epoch_mismatch" },
			});
			return () => {};
		}
		const since = input.since ?? runtime.journal.latestSeq;
		const backlog = runtime.journal.after(since);
		if (backlog === null) {
			onEnvelope({
				// Reset frames short-circuit client seq checks; seq is nominal.
				seq: runtime.journal.latestSeq,
				epoch: runtime.journal.epoch,
				sessionId: runtime.state.sessionId,
				ts: Date.now(),
				frame: { kind: "reset", reason: "journal_evicted" },
			});
			return () => {};
		}
		// Replay + attach happen in one synchronous block, so no envelope can
		// land in the gap between them.
		for (const envelope of backlog) {
			onEnvelope(envelope);
		}
		runtime.subscribers.add(onEnvelope);
		this.clearIdleHibernate(runtime);
		return () => {
			runtime.subscribers.delete(onEnvelope);
			this.scheduleIdleHibernate(runtime);
		};
	}

	/** Adapter process pid — lets tests and ops target the child directly. */
	adapterPid(sessionId: string): number | null {
		return this.require(sessionId).child.pid ?? null;
	}

	/** Active turns/interactions whose process-local callbacks make replacement unsafe. */
	pendingInteractionCount(): number {
		let count = 0;
		for (const runtime of this.runtimes.values()) {
			count += Math.max(
				runtime.activePromptCount,
				runtime.state.pendingPermissions.length,
			);
		}
		return count;
	}

	/** Kill every adapter process. Journals die with the manager. */
	async dispose(): Promise<void> {
		const inflight = [...this.creations.values()].map((creation) =>
			creation.promise.catch(() => null),
		);
		await Promise.all(inflight);
		for (const runtime of this.runtimes.values()) {
			this.clearIdleHibernate(runtime);
			for (const requestId of [...runtime.pendingResolvers.keys()]) {
				this.settlePermission(runtime, requestId, { outcome: "cancelled" });
			}
			try {
				runtime.connection.close();
			} catch {
				// best-effort — the stream may already be closed
			}
			try {
				runtime.child.kill();
			} catch {
				// best-effort — the process may already be gone
			}
		}
		this.runtimes.clear();
	}

	// -------------------------------------------------------------------------
	// Lifecycle internals
	// -------------------------------------------------------------------------

	private async getOrCreateRuntime(
		sessionId: string,
		workspaceId: string,
		harness: HarnessKind,
		model?: string,
		strictModel = false,
		role?: SupersetSessionRole,
	): Promise<AcpSessionRuntime> {
		const existing = this.runtimes.get(sessionId);
		if (existing) {
			if (existing.state.workspaceId !== workspaceId) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to workspace ${existing.state.workspaceId}`,
				);
			}
			if (existing.state.harness !== harness) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to ${existing.state.harness}`,
				);
			}
			if (role !== undefined && existing.role !== role) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to role ${existing.role}`,
				);
			}
			return existing;
		}

		const inflight = this.creations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}

		// A create() re-issued for a persisted session (the client's normal
		// open-session flow after a host restart) resurrects instead of minting
		// a fresh adapter session — same idempotency contract as the live case.
		const record = this.offline.get(sessionId);
		if (record) {
			if (record.workspaceId !== workspaceId) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to workspace ${record.workspaceId}`,
				);
			}
			if (record.harness !== harness) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to ${record.harness}`,
				);
			}
			if (role !== undefined && record.role !== role) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to role ${record.role}`,
				);
			}
			return this.resurrectRuntime(record);
		}

		const promise = this.createRuntime(
			sessionId,
			workspaceId,
			undefined,
			harness,
			false,
			model,
			strictModel,
			role ?? SUPERSET_ROOT_COORDINATOR_ROLE,
		).finally(() => {
			this.creations.delete(sessionId);
		});
		this.creations.set(sessionId, { workspaceId, promise });
		return promise;
	}

	/** Spawn + session/load for an offline record; deduped via `creations`. */
	private resurrectRuntime(
		record: AcpSessionRecord,
	): Promise<AcpSessionRuntime> {
		const inflight = this.creations.get(record.sessionId);
		if (inflight) return inflight.promise;
		const promise = this.createRuntime(
			record.sessionId,
			record.workspaceId,
			record,
		)
			.then((runtime) => {
				this.offline.delete(record.sessionId);
				return runtime;
			})
			.finally(() => {
				this.creations.delete(record.sessionId);
			});
		this.creations.set(record.sessionId, {
			workspaceId: record.workspaceId,
			promise,
		});
		return promise;
	}

	private async createRuntime(
		sessionId: string,
		workspaceId: string,
		resume?: AcpSessionRecord,
		harness: HarnessKind = resume?.harness ?? "claude-agent-acp",
		/** A missing native session requires a whole new adapter boundary. */
		startFreshAfterMissingUpstream = false,
		/** Client-preferred model id, applied after `session/new`. */
		model?: string,
		/** Fail creation unless the adapter confirms the requested model. */
		strictModel = false,
		role: SupersetSessionRole = resume?.role ?? SUPERSET_ROOT_COORDINATOR_ROLE,
	): Promise<AcpSessionRuntime> {
		let epoch = resume?.epoch ?? randomUUID();
		let durableEntries: SessionUpdateEnvelope[] = [];
		let restoredQueuedCommands = replayRemoteCommands([]);
		let persistedPiFirstUserMessageSeq: number | null = null;
		if (resume && this.persistence) {
			try {
				durableEntries = this.persistence.loadJournal(sessionId, epoch);
				if (harness === "pi-acp") {
					persistedPiFirstUserMessageSeq =
						firstPiUserMessageSeq(durableEntries);
					durableEntries = suppressPersistedPiBootstrap(
						durableEntries,
						persistedPiFirstUserMessageSeq,
					);
				}
			} catch (error) {
				// A partially written/corrupt journal must never continue at a
				// potentially reused seq. Switch incarnation; clients holding the
				// old cursor get an explicit epoch reset instead of bad replay.
				console.error(
					"[acp-sessions] journal integrity failed; minting new epoch",
					error,
				);
				epoch = randomUUID();
			}
		}
		if (durableEntries.length > 0) {
			const replayed = replayRemoteCommands(durableEntries);
			restoredQueuedCommands = {
				queued: orderReplayedRemoteQueue(replayed.queued, durableEntries),
				sendNow: replayed.sendNow,
			};
		}
		const cwd = await this.resolveWorkspaceCwd(workspaceId);
		assertWorkspaceCwd(cwd, workspaceId);
		const mcpServers = [
			...this.mcpServers,
			...(this.mcpServerFactory?.({ sessionId, workspaceId, cwd, role }) ?? []),
		];
		const modelFacingInstructions = (
			role === SUPERSET_DELEGATED_EXECUTOR_ROLE
				? SUPERSET_DELEGATED_EXECUTOR_INSTRUCTIONS
				: this.modelFacingInstructions?.({ role })
		)?.trim();
		const sessionMeta = modelFacingInstructions
			? ({
					[SUPERSET_DELEGATION_META_KEY]: modelFacingInstructions,
					...(harness === "claude-agent-acp"
						? {
								systemPrompt: {
									type: "preset" as const,
									preset: "claude_code" as const,
									append: modelFacingInstructions,
								},
							}
						: {}),
				} satisfies Record<string, unknown>)
			: undefined;
		// process.execPath instead of a PATH lookup for "node": inside the
		// packaged Electron app there is no node on PATH — the Electron binary
		// itself runs the script when ELECTRON_RUN_AS_NODE is set (the same
		// pattern the desktop coordinator uses to spawn this host service).
		// Ambient Anthropic credentials (repo .env pulled in by a dev launcher,
		// shell profile) must never reach the agent child: they silently
		// override the user's own Claude login for the whole session. Scrubbed
		// here — the spawn site — so every launch path is covered, not just dev.
		const adapterProcess = resolveAdapterProcess(
			harness,
			{
				adapterEntry: this.adapterEntry,
				codexAdapterEntry: this.codexAdapterEntry,
				piAdapterEntry: this.piAdapterEntry,
				myflickerAdapterCommand: this.myflickerAdapterCommand,
				deepseekAdapterCommand: this.deepseekAdapterCommand,
				deepseekAdapterConfig: this.deepseekAdapterConfig,
			},
			this.adapterExecPath,
		);
		const env: Record<string, string | undefined> = {
			...process.env,
			...this.adapterEnv,
		};
		if (harness === "pi-acp" && modelFacingInstructions) {
			// The SDK adapter reads the ACP metadata directly. Keep this environment
			// fallback for older clients and source-launched adapters.
			env.SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT = modelFacingInstructions;
		} else {
			delete env.SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT;
		}
		env.SUPERSET_ACP_SESSION_ROLE = role;
		if (harness === "claude-agent-acp" && !this.adapterEntry) {
			assertExternalClaudeCliAvailable(env);
		}
		if (harness === "myflicker-acp") {
			assertExternalCliAvailable(
				adapterProcess.command,
				"MyFlicker",
				"Install MyFlicker CLI (`mfcli`) and ensure `mfcli` is on PATH, or set SUPERSET_MFCLI_ACP_COMMAND to its executable path.",
				env,
			);
		}
		if (harness === "deepseek-acp") {
			assertExternalCliAvailable(
				adapterProcess.command,
				"DeepSeek Harness",
				"Install DeepSeek Harness and ensure `dsh-acp-demo` is on PATH, or set SUPERSET_DSH_ACP_COMMAND to its executable path.",
				env,
			);
		}
		if (adapterProcess.usesElectronNode) env.ELECTRON_RUN_AS_NODE = "1";
		else delete env.ELECTRON_RUN_AS_NODE;
		delete env.ANTHROPIC_API_KEY;
		delete env.ANTHROPIC_AUTH_TOKEN;
		if (harness === "codex-app-server" && model) {
			// Codex app-server accepts a model only while creating the thread, not
			// through ACP's later session/set_config_option request.
			env.SUPERSET_CODEX_MODEL = model;
			if (strictModel) env.SUPERSET_CODEX_STRICT_MODEL = "1";
			else delete env.SUPERSET_CODEX_STRICT_MODEL;
		} else {
			delete env.SUPERSET_CODEX_MODEL;
			delete env.SUPERSET_CODEX_STRICT_MODEL;
		}
		const child = spawn(adapterProcess.command, adapterProcess.args, {
			cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		// spawn reports ENOENT/EACCES asynchronously. Always consume this event
		// before any ACP request so a bad adapter can reject this create without
		// becoming an uncaught exception in the long-lived daemon process.
		let runtime: AcpSessionRuntime | null = null;
		let spawnError: Error | null = null;
		let resolveSpawnError!: () => void;
		const spawnErrorSettled = new Promise<void>((resolve) => {
			resolveSpawnError = resolve;
		});
		let rejectSpawnError: ((error: Error) => void) | undefined;
		const spawnErrorPromise = new Promise<never>((_, reject) => {
			rejectSpawnError = reject;
		});
		let closeConnectionWithSpawnError: ((error: Error) => void) | undefined;
		// The promise is intentionally shared by startup requests and remains
		// handled after a successful startup in case a later child error arrives.
		void spawnErrorPromise.catch(() => {});
		child.on("error", (error) => {
			spawnError ??= error;
			resolveSpawnError();
			rejectSpawnError?.(error);
			closeConnectionWithSpawnError?.(error);
			if (runtime) {
				this.markDead(runtime, `adapter process error: ${error.message}`);
			}
		});
		if (!child.stdin || !child.stdout) {
			child.kill();
			throw new Error("adapter child process is missing stdio pipes");
		}

		// Handlers are registered before session/new, so they close over the
		// mutable runtime slot; updates that race construction are buffered and
		// folded once the runtime exists.
		// session/load can replay an arbitrarily long native transcript before its
		// response resolves. This fixed-size ring retains only the same recent
		// window the journal can serve, with O(1) eviction even for huge sessions.
		const earlyUpdates = new Array<SessionNotification | undefined>(
			this.journalCapacity,
		);
		let earlyUpdatesStart = 0;
		let earlyUpdatesSize = 0;
		const bufferEarlyUpdate = (notification: SessionNotification) => {
			if (earlyUpdatesSize < this.journalCapacity) {
				earlyUpdates[
					(earlyUpdatesStart + earlyUpdatesSize) % this.journalCapacity
				] = notification;
				earlyUpdatesSize += 1;
				return;
			}
			earlyUpdates[earlyUpdatesStart] = notification;
			earlyUpdatesStart = (earlyUpdatesStart + 1) % this.journalCapacity;
		};
		let stderrTail = "";
		child.stderr?.on("data", (chunk: Buffer) => {
			stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
			if (runtime) runtime.stderrTail = stderrTail;
		});

		const app = client({ name: CLIENT_INFO.name })
			.onRequest(
				"session/request_permission",
				(
					context,
				): RequestPermissionResponse | Promise<RequestPermissionResponse> => {
					const target = runtime;
					if (!target || target.dead || target.closed) {
						return { outcome: { outcome: "cancelled" } };
					}
					return this.parkPermission(target, context);
				},
			)
			.onRequest(
				"elicitation/create",
				(
					context,
				): CreateElicitationResponse | Promise<CreateElicitationResponse> => {
					const target = runtime;
					if (!target || target.dead || target.closed) {
						return { action: "cancel" };
					}
					return this.parkElicitation(target, context);
				},
			)
			.onNotification("session/update", (context) => {
				if (!runtime) {
					bufferEarlyUpdate(context.params);
					return;
				}
				this.handleUpdate(runtime, context.params);
			});

		// `toWeb` returns differently-parameterized stream types depending on
		// which @types/node lib a consumer compiles under, so cast via unknown.
		const stream = ndJsonStream(
			Writable.toWeb(child.stdin) as unknown as WritableStream<Uint8Array>,
			Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
		);
		const connection = app.connect(stream);
		closeConnectionWithSpawnError = (error) => connection.close(error);
		const requestDuringStartup = <T>(request: Promise<T>): Promise<T> =>
			Promise.race([request, spawnErrorPromise]);

		try {
			await requestDuringStartup(
				connection.agent.request("initialize", {
					protocolVersion: PROTOCOL_VERSION,
					clientInfo: CLIENT_INFO,
					clientCapabilities: {
						fs: { readTextFile: false, writeTextFile: false },
						terminal: false,
						_meta: { terminal_output: true },
						// UNSTABLE ACP extension, but it is what re-enables Claude
						// Code's built-in AskUserQuestion tool — the adapter disallows
						// the tool for clients that can't render form elicitations.
						elicitation: { form: {} },
					},
				}),
			);
			let acpSessionId: string;
			let modes: SessionModeState | null;
			let configOptions: SessionConfigOption[];
			let piStartupInfo: string | null = null;
			if (resume && !startFreshAfterMissingUpstream) {
				// Superset's durable journal is authoritative. Pi can skip its native
				// transcript replay entirely; other adapters may still replay during
				// session/load, and those early notifications are discarded below.
				try {
					const skipTranscriptReplay =
						harness === "pi-acp" && durableEntries.length > 0;
					const loadMeta = {
						...(sessionMeta ?? {}),
						...(skipTranscriptReplay
							? { [SKIP_TRANSCRIPT_REPLAY_META_KEY]: true }
							: {}),
					};
					const loaded = await requestDuringStartup(
						connection.agent.request("session/load", {
							sessionId: resume.acpSessionId,
							cwd,
							mcpServers,
							...(Object.keys(loadMeta).length > 0 ? { _meta: loadMeta } : {}),
						}),
					);
					acpSessionId = resume.acpSessionId;
					modes = loaded.modes ?? null;
					configOptions = loaded.configOptions ?? [];
				} catch (error) {
					if (!isMissingUpstreamResourceError(error)) throw error;
					// Do not follow this with session/new on the same connection. Claude's
					// ACP adapter may have destroyed the underlying native input stream
					// while returning this otherwise recoverable JSON-RPC error.
					throw new MissingUpstreamSessionError();
				}
			} else {
				const session = await requestDuringStartup(
					connection.agent.request("session/new", {
						cwd,
						mcpServers,
						...(sessionMeta ? { _meta: sessionMeta } : {}),
					}),
				);
				acpSessionId = session.sessionId;
				if (harness === "pi-acp") {
					piStartupInfo = piStartupInfoFromSessionResponse(session);
				}
				modes = session.modes ?? null;
				configOptions = session.configOptions ?? [];
			}

			// Apply the client-preferred model on fresh sessions only — a
			// resumed session keeps whatever model it persisted.
			if (model && !resume) {
				const modelOption = configOptions.find(
					(option) =>
						option.type === "select" &&
						(option.id === "model" || option.category === "model"),
				);
				if (!modelOption && strictModel) {
					throw new Error(
						`ACP adapter ${harness} does not expose a model option; required model "${model}" was not applied`,
					);
				}
				if (modelOption && modelOption.type === "select") {
					const allOptions = (modelOption.options ?? []).flatMap(
						(o): { value: string }[] => ("options" in o ? o.options : [o]),
					);
					// Prefer exact match; fall back to substring so short names
					// like "sonnet" resolve to "claude-sonnet-4-5".
					const resolved =
						allOptions.find((o) => o.value === model)?.value ??
						allOptions.find((o) => o.value.includes(model))?.value ??
						model;
					try {
						const response = await requestDuringStartup(
							connection.agent.request("session/set_config_option", {
								sessionId: acpSessionId,
								configId: modelOption.id,
								value: resolved,
							}),
						);
						configOptions = response.configOptions;
						const appliedModel = configOptions.find(
							(option) => option.id === modelOption.id,
						);
						if (strictModel && appliedModel?.currentValue !== resolved) {
							throw new Error(
								`ACP adapter ${harness} did not confirm required model "${model}"`,
							);
						}
					} catch (error) {
						if (strictModel) {
							throw new Error(
								`ACP adapter ${harness} rejected required model "${model}"`,
								{ cause: error },
							);
						}
						console.warn(
							`[acp-sessions] adapter rejected model "${model}"; keeping adapter default`,
							error,
						);
					}
				}
			}

			// Superset defaults ACP sessions to bypassPermissions so the user
			// never has to approve individual tool calls. Fresh sessions are
			// forced into bypass outright; resumed sessions only get pulled
			// back into bypass if the adapter re-hydrated them in `default`
			// (a cold-start fallback), so a user-picked mode (plan,
			// acceptEdits) survives the restart.
			const hasBypassMode = modes?.availableModes.some(
				(mode) => mode.id === "bypassPermissions",
			);
			const forceBypassMode = resume
				? modes?.currentModeId === "default"
				: modes !== null && modes.currentModeId !== "bypassPermissions";
			if (modes && hasBypassMode && forceBypassMode) {
				await requestDuringStartup(
					connection.agent.request("session/set_mode", {
						sessionId: acpSessionId,
						modeId: "bypassPermissions",
					}),
				);
				modes = { ...modes, currentModeId: "bypassPermissions" };
			}

			const now = Date.now();
			const restoredSendNow = restoredQueuedCommands.sendNow.at(-1);
			const created: AcpSessionRuntime = {
				state: {
					sessionId,
					epoch,
					workspaceId,
					harness,
					status: "idle",
					title: resume?.title ?? null,
					currentMode: modes,
					configOptions,
					availableCommands: null,
					pendingPermissions: [],
					queuedPrompts: restoredQueuedCommands.queued.map((command) => ({
						queueId: command.queueId,
						prompt: [...command.prompt],
						enqueuedAt: command.enqueuedAt,
					})),
					cwd,
					lastSeq: 0,
					lastStopReason: resume?.lastStopReason ?? null,
					lastCompletedAt: resume?.lastCompletedAt ?? null,
					lastError: null,
					createdAt: resume?.createdAt ?? now,
					updatedAt: now,
				},
				role,
				acpSessionId,
				child,
				connection,
				journal: new SessionJournal({
					epoch,
					capacity: this.journalCapacity,
					entries: durableEntries,
				}),
				subscribers: new Set(),
				pendingResolvers: new Map(),
				openToolCalls: new Set(),
				askUserToolCalls: new Set(),
				piStartupInfo,
				piFirstUserMessageSeq:
					harness === "pi-acp" ? persistedPiFirstUserMessageSeq : null,
				activePromptCount: 0,
				pendingSendNow: restoredSendNow
					? {
							queueId: restoredSendNow.queueId,
							prompt: [...restoredSendNow.prompt],
							enqueuedAt: restoredSendNow.enqueuedAt,
						}
					: null,
				stderrTail,
				dead: false,
				closed: false,
				// A resumed session already carries whatever title was in the
				// registry — no need to regenerate. A fresh session starts
				// title-less and the first prompt kicks off the generator.
				titleGenerationStarted: resume?.title != null,
				titleGenerationInFlight: false,
				idleHibernateTimer: null,
			};
			runtime = created;
			for (const command of restoredQueuedCommands.queued) {
				this.queuedCommandIds.set(
					`${sessionId}:${command.queueId}`,
					command.commandId,
				);
			}
			if (restoredSendNow) {
				this.pendingSendNowCommandIds.set(sessionId, restoredSendNow.commandId);
			}
			for (let index = 0; index < earlyUpdatesSize; index += 1) {
				const notification =
					earlyUpdates[(earlyUpdatesStart + index) % this.journalCapacity];
				// A resumed ACP adapter commonly replays its transcript. The local
				// durable journal already has that authoritative history, so avoid
				// duplicating it; state is refreshed by the load response below.
				if (notification && (!resume || durableEntries.length === 0)) {
					this.handleUpdate(created, notification);
				}
			}
			if (resume) {
				// Nothing replayed can still be running — the process it ran in is
				// gone. Terminalize whatever the stored transcript left open so it
				// doesn't render as in-progress forever.
				this.terminalizeOpenToolCalls(created);
			}

			child.on("exit", (code, signal) => {
				this.markDead(
					created,
					`adapter exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
				);
			});
			connection.signal.addEventListener("abort", () => {
				this.markDead(created, "adapter connection closed");
			});
			// The process may have died between session/new resolving and the
			// listeners attaching — catch up on that state, else seed the journal.
			if (child.exitCode !== null || child.signalCode !== null) {
				this.markDead(
					created,
					`adapter exited (code=${child.exitCode ?? "null"}, signal=${child.signalCode ?? "null"})`,
				);
			} else if (connection.signal.aborted) {
				this.markDead(created, "adapter connection closed");
			} else {
				this.emitState(created);
			}

			this.runtimes.set(sessionId, created);
			this.scheduleIdleHibernate(created);
			// A restart can leave a durable queued command with no live caller to
			// trigger the normal enqueue/sendNow drain. Register first so the
			// prompt boundary can resolve the runtime, then drain asynchronously.
			if (created.pendingSendNow || created.state.queuedPrompts.length > 0) {
				queueMicrotask(() => this.drainQueue(created));
			}
			return created;
		} catch (error) {
			if (!spawnError) {
				// The child error and the SDK's stream abort are separate events. Give
				// the child error one turn to win that race before choosing the SDK's
				// generic abort as the create failure.
				await Promise.race([
					spawnErrorSettled,
					new Promise<void>((resolve) => setTimeout(resolve, 0)),
				]);
			}
			const startupError = spawnError ?? error;
			try {
				connection.close();
			} catch {
				// best-effort — the stream may already be closed
			}
			child.kill();
			// The child and ACP connection above are intentionally discarded before
			// session/new. This is the recovery isolation boundary, not a retry of
			// an individual JSON-RPC request. One retry only: a new adapter cannot
			// legitimately report the same missing native id because we create one.
			if (
				startupError instanceof MissingUpstreamSessionError &&
				resume &&
				!startFreshAfterMissingUpstream
			) {
				return this.createRuntime(
					sessionId,
					workspaceId,
					resume,
					harness,
					true,
				);
			}
			const startupSpawnError = spawnError as Error | null;
			if (startupSpawnError) {
				throw new Error(
					`Failed to start ${harness} ACP adapter: ${startupSpawnError.message}`,
					{ cause: startupSpawnError },
				);
			}
			throw startupError;
		}
	}

	/** Read-only durable history for an offline persisted session. */
	private offlineJournal(sessionId: string): SessionJournal {
		const record = this.offline.get(sessionId);
		if (!record) {
			throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
		}
		return new SessionJournal({
			epoch: record.epoch,
			capacity: this.journalCapacity,
			// A durable read failure is not an empty history. Propagate it rather
			// than silently rendering a false blank transcript.
			entries: this.persistence?.loadJournal(sessionId, record.epoch) ?? [],
		});
	}

	private clearIdleHibernate(runtime: AcpSessionRuntime): void {
		if (runtime.idleHibernateTimer === null) return;
		clearTimeout(runtime.idleHibernateTimer);
		runtime.idleHibernateTimer = null;
	}

	private canHibernate(runtime: AcpSessionRuntime): boolean {
		return (
			this.persistence !== undefined &&
			this.runtimes.get(runtime.state.sessionId) === runtime &&
			!runtime.dead &&
			!runtime.closed &&
			runtime.state.status === "idle" &&
			runtime.subscribers.size === 0 &&
			runtime.activePromptCount === 0 &&
			runtime.state.queuedPrompts.length === 0 &&
			runtime.pendingSendNow === null &&
			runtime.state.pendingPermissions.length === 0 &&
			runtime.pendingResolvers.size === 0 &&
			runtime.openToolCalls.size === 0 &&
			!runtime.titleGenerationInFlight
		);
	}

	private scheduleIdleHibernate(runtime: AcpSessionRuntime): void {
		this.clearIdleHibernate(runtime);
		if (this.idleHibernateMs === null || !this.canHibernate(runtime)) return;
		const timer = setTimeout(() => {
			runtime.idleHibernateTimer = null;
			if (this.canHibernate(runtime)) this.hibernate(runtime);
		}, this.idleHibernateMs);
		(timer as unknown as { unref?: () => void }).unref?.();
		runtime.idleHibernateTimer = timer;
	}

	/**
	 * Turn a live, quiescent runtime back into its persisted offline form. This
	 * deliberately does not use close(): hibernation preserves its registry,
	 * journal, artifacts, and native ACP session id for session/load.
	 */
	private hibernate(runtime: AcpSessionRuntime): void {
		if (!this.canHibernate(runtime)) return;
		this.clearIdleHibernate(runtime);
		runtime.state.updatedAt = Date.now();
		const record: AcpSessionRecord = {
			sessionId: runtime.state.sessionId,
			workspaceId: runtime.state.workspaceId,
			acpSessionId: runtime.acpSessionId,
			epoch: runtime.state.epoch,
			role: runtime.role,
			harness: runtime.state.harness,
			cwd: runtime.state.cwd,
			title: runtime.state.title,
			lastStopReason: runtime.state.lastStopReason,
			lastCompletedAt: runtime.state.lastCompletedAt,
			createdAt: runtime.state.createdAt,
			updatedAt: runtime.state.updatedAt,
		};
		try {
			// The durable registry is the recovery contract. Do not release the
			// in-memory journal if recording this offline incarnation fails.
			this.persistence?.upsert(record);
		} catch (error) {
			console.warn(
				"[acp-sessions] failed to persist hibernated session",
				error,
			);
			this.scheduleIdleHibernate(runtime);
			return;
		}
		// Ignore late abort/exit events from the intentionally closed transport.
		runtime.closed = true;
		this.runtimes.delete(runtime.state.sessionId);
		this.offline.set(record.sessionId, record);
		try {
			runtime.connection.close();
		} catch {
			// best-effort — the stream may already be closed
		}
		try {
			runtime.child.kill();
		} catch {
			// best-effort — the process may already have exited
		}
		this.notifySessionChange({
			sessionId: record.sessionId,
			workspaceId: record.workspaceId,
			eventType: "changed",
			status: "offline",
			occurredAt: Date.now(),
		});
	}

	private markDead(runtime: AcpSessionRuntime, reason: string): void {
		if (runtime.dead || runtime.closed) return;
		this.clearIdleHibernate(runtime);
		runtime.dead = true;
		for (const requestId of [...runtime.pendingResolvers.keys()]) {
			this.settlePermission(runtime, requestId, { outcome: "cancelled" });
		}
		this.terminalizeOpenToolCalls(runtime);
		const stderr = runtime.stderrTail.trim();
		runtime.state.lastError = stderr ? `${reason}\n${stderr}` : reason;
		this.syncStatus(runtime, { force: true });
		this.evictDeadRuntimes();
	}

	/**
	 * Fire the injected `generateTitle` on the first prompt of a fresh
	 * session and, when it resolves, feed a synthetic session_info_update
	 * through the same path an adapter-emitted one would take. Errors are
	 * swallowed: a titleless tab is fine (the renderer falls back to the
	 * agent label), and this must not affect the turn.
	 */
	private maybeStartTitleGeneration(
		runtime: AcpSessionRuntime,
		prompt: ContentBlock[],
	): void {
		const sessionId = runtime.state.sessionId;
		if (!this.generateTitle) {
			console.log(`[acp-title] skip ${sessionId}: no generateTitle injected`);
			return;
		}
		if (runtime.titleGenerationStarted) return;
		if (runtime.state.title != null) {
			console.log(
				`[acp-title] skip ${sessionId}: already has title "${runtime.state.title}"`,
			);
			return;
		}
		const message = prompt
			.map((block) => {
				if (block.type === "text") return block.text;
				if (block.type === "image") return "[Image attached]";
				return "";
			})
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (!message) {
			console.log(`[acp-title] skip ${sessionId}: prompt has no text`);
			return;
		}
		runtime.titleGenerationStarted = true;
		runtime.titleGenerationInFlight = true;
		console.log(
			`[acp-title] start ${sessionId}: message="${message.slice(0, 80)}"`,
		);
		const generate = this.generateTitle;
		const workspaceId = runtime.state.workspaceId;
		const acpSessionId = runtime.acpSessionId;
		void generate({ sessionId, workspaceId, message })
			.then((raw) => {
				if (runtime.closed || runtime.dead) {
					console.log(
						`[acp-title] drop ${sessionId}: session closed/dead before title landed`,
					);
					return;
				}
				const title = sanitizeSessionTitle(raw);
				if (!title) {
					console.log(
						`[acp-title] drop ${sessionId}: generator returned ${JSON.stringify(raw)}`,
					);
					return;
				}
				console.log(`[acp-title] resolved ${sessionId}: "${title}"`);
				// Feed the synthetic notification through the same path an
				// adapter-emitted one would take: journal → state → subscribers
				// → persistence. sessionId must match the runtime's acp id.
				this.handleUpdate(runtime, {
					sessionId: acpSessionId,
					update: {
						sessionUpdate: "session_info_update",
						title,
						updatedAt: new Date().toISOString(),
					},
				});
			})
			.catch((error) => {
				console.warn(
					`[acp-sessions] title generation failed for session ${sessionId}`,
					error,
				);
			})
			.finally(() => {
				runtime.titleGenerationInFlight = false;
				this.scheduleIdleHibernate(runtime);
			});
	}

	/**
	 * Journal a terminal status for every tool call still in flight. ACP has
	 * no cancelled status, so failed is the terminal we have; the journal is
	 * host-owned, so this is safe even after the adapter is gone.
	 */
	private terminalizeOpenToolCalls(runtime: AcpSessionRuntime): void {
		for (const toolCallId of runtime.openToolCalls) {
			this.journalFrame(runtime, {
				kind: "update",
				update: {
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: "failed",
				},
			});
		}
		runtime.openToolCalls.clear();
		runtime.askUserToolCalls.clear();
	}

	/** Bound the dead-session graveyard; oldest (by updatedAt) go first. */
	private evictDeadRuntimes(): void {
		const dead = [...this.runtimes.values()].filter((runtime) => runtime.dead);
		if (dead.length <= MAX_DEAD_RUNTIMES) return;
		dead.sort((a, b) => a.state.updatedAt - b.state.updatedAt);
		for (const runtime of dead.slice(0, dead.length - MAX_DEAD_RUNTIMES)) {
			this.runtimes.delete(runtime.state.sessionId);
		}
	}

	// -------------------------------------------------------------------------
	// Update / permission plumbing
	// -------------------------------------------------------------------------

	private handleUpdate(
		runtime: AcpSessionRuntime,
		notification: SessionNotification,
	): void {
		if (runtime.closed) return;
		if (notification.sessionId !== runtime.acpSessionId) return;
		const update = notification.update;
		if (this.shouldSuppressPiBootstrapUpdate(runtime, update)) return;
		this.journalFrame(runtime, { kind: "update", update });
		// Most variants are timeline-only; these few also live in scoped state.
		switch (update.sessionUpdate) {
			case "tool_call":
			case "tool_call_update": {
				if (isClaudeAskUserQuestion(update)) {
					runtime.askUserToolCalls.add(update.toolCallId);
				}
				const status =
					update.status ??
					(update.sessionUpdate === "tool_call" ? "pending" : null);
				if (status === "completed" || status === "failed") {
					runtime.openToolCalls.delete(update.toolCallId);
					runtime.askUserToolCalls.delete(update.toolCallId);
				} else if (status !== null) {
					runtime.openToolCalls.add(update.toolCallId);
				}
				break;
			}
			case "session_info_update":
				// Per ACP: absent = unchanged, explicit null = clear. Kept on
				// scoped state so the title survives journal eviction/resyncs.
				if (update.title !== undefined) {
					runtime.state.title = update.title;
					this.emitState(runtime);
				}
				break;
			case "current_mode_update":
				if (runtime.state.currentMode) {
					runtime.state.currentMode = {
						...runtime.state.currentMode,
						currentModeId: update.currentModeId,
					};
					this.emitState(runtime);
				}
				break;
			case "config_option_update":
				runtime.state.configOptions = update.configOptions;
				this.emitState(runtime);
				break;
			case "available_commands_update":
				runtime.state.availableCommands = cloneAvailableCommands(
					update.availableCommands,
				);
				this.emitState(runtime);
				break;
			default:
				break;
		}
	}

	private shouldSuppressPiBootstrapUpdate(
		runtime: AcpSessionRuntime,
		update: SessionNotification["update"],
	): boolean {
		if (runtime.state.harness !== "pi-acp") return false;
		if (
			update.sessionUpdate === "agent_message_chunk" &&
			update.content.type === "text" &&
			runtime.piStartupInfo !== null &&
			update.content.text === runtime.piStartupInfo
		) {
			// Pi declares this opaque startup payload in session/new metadata,
			// then emits it asynchronously. Consume it even if the user prompts
			// immediately after creation. A cache-backed upgrade notice is the sole
			// exception: it has no TUI payload and remains a non-blocking message.
			runtime.piStartupInfo = null;
			return !isPiUpdateNotice(update.content.text);
		}
		// Older Pi journals have no startup metadata. Before Superset has
		// journaled a user block, timeline updates are adapter bootstrap only.
		return runtime.piFirstUserMessageSeq === null && isPiTimelineUpdate(update);
	}

	private async parkPermission(
		runtime: AcpSessionRuntime,
		context: PermissionRequestContext,
	): Promise<RequestPermissionResponse> {
		// The SDK dispatches notifications and requests independently. Give the
		// immediately preceding tool_call_update one event-loop turn to reach its
		// handler before consulting the correlation set; otherwise the request can
		// win that race despite arriving after the update on the adapter stream.
		await new Promise<void>((resolve) => setImmediate(resolve));
		const requestId =
			context.requestId !== null && context.requestId !== undefined
				? String(context.requestId)
				: randomUUID();
		const extensionUi = piExtensionUiPermissionPresentation(
			runtime.state.harness,
			context.params.toolCall,
		);
		const pending: PendingPermission = {
			requestId,
			toolCall: context.params.toolCall,
			options: context.params.options,
			requestedAt: Date.now(),
			...(runtime.askUserToolCalls.has(context.params.toolCall.toolCallId) ||
			extensionUi
				? { isElicitation: true }
				: {}),
			...(extensionUi?.allowsCustomResponse
				? { allowsCustomResponse: true }
				: {}),
		};
		runtime.state.pendingPermissions = [
			...runtime.state.pendingPermissions,
			pending,
		];
		this.journalFrame(runtime, { kind: "permission_requested", pending });
		this.syncStatus(runtime, { force: true });
		return new Promise<RequestPermissionResponse>((resolve) => {
			runtime.pendingResolvers.set(requestId, (outcome) =>
				resolve({ outcome }),
			);
			// The adapter aborts the request when the turn ends unanswered
			// (session/cancel, turn error) — settle so nothing leaks. The signal
			// may already be aborted by the time we get here (listeners on an
			// aborted signal never fire), so check first.
			const settleCancelled = () =>
				this.settlePermission(runtime, requestId, { outcome: "cancelled" });
			if (context.signal.aborted) {
				settleCancelled();
				return;
			}
			context.signal.addEventListener("abort", settleCancelled);
		});
	}

	/**
	 * A form elicitation (the adapter's rendering of Claude Code's built-in
	 * AskUserQuestion tool) parked as one synthetic pending-permission card per
	 * question — the same journal/resolution plumbing and UI as real permission
	 * asks. Questions are presented one at a time; each card's options are the
	 * question's enum labels plus Skip, with an optional free-text response. The
	 * accepted response maps back onto the form's matching question field.
	 */
	private async parkElicitation(
		runtime: AcpSessionRuntime,
		context: {
			params: CreateElicitationRequest;
			signal: AbortSignal;
		},
	): Promise<CreateElicitationResponse> {
		const params = context.params;
		if (params.mode !== "form") {
			// Nothing mobile can render for url (or unknown) modes.
			return { action: "cancel" };
		}
		const questions = extractElicitationQuestions(params);
		if (questions.length === 0) {
			// An arbitrary form (e.g. from a user-configured MCP server) with no
			// recognizable question fields — decline rather than abort the tool.
			return { action: "decline" };
		}
		// Request-scoped elicitations (pre-session) carry no toolCallId.
		const adapterToolCallId =
			"toolCallId" in params ? (params.toolCallId ?? null) : null;
		const toolCallId = adapterToolCallId ?? `elicitation-${randomUUID()}`;
		// A synthetic card's tool row has no adapter behind it to ever send a
		// terminal status — journal one ourselves or it renders as running
		// forever. Adapter-owned tool calls get their updates from the adapter.
		const finish = (
			response: CreateElicitationResponse,
		): CreateElicitationResponse => {
			if (adapterToolCallId === null) {
				this.journalFrame(runtime, {
					kind: "update",
					update: {
						sessionUpdate: "tool_call_update",
						toolCallId,
						status: response.action === "accept" ? "completed" : "failed",
					},
				});
			}
			return response;
		};
		const result = await this.runAskUserQuestions(
			runtime,
			questions.map((question) => ({
				question: question.title,
				options: question.labels.map((label) => ({ label })),
				multiSelect: question.multiSelect,
				allowsCustomResponse: question.customFieldKey !== undefined,
			})),
			{ toolCallId, signal: context.signal },
		);
		if (result.action === "cancelled") {
			return finish({ action: "cancel" });
		}

		const content: Record<string, string | string[]> = {};
		questions.forEach((question, index) => {
			const answer = result.answers[index];
			if (!answer) return;
			if (
				answer.customResponse !== undefined &&
				question.customFieldKey !== undefined
			) {
				content[question.customFieldKey] = answer.customResponse;
				return;
			}
			const [firstLabel] = answer.selectedLabels;
			if (firstLabel === undefined) return;
			content[question.fieldKey] = question.multiSelect
				? answer.selectedLabels
				: firstLabel;
		});
		return finish({ action: "accept", content });
	}

	private async runAskUserQuestions(
		runtime: AcpSessionRuntime,
		questions: CanonicalAskUserQuestion[],
		context?: { toolCallId?: string; signal?: AbortSignal },
	): Promise<AskUserResult> {
		const answers: AskUserAnswer[] = [];
		const toolCallId = context?.toolCallId ?? `elicitation-${randomUUID()}`;
		for (const question of questions) {
			const outcome = await this.parkQuestionCard(runtime, {
				toolCallId,
				title: question.question,
				multiSelect: question.multiSelect,
				allowsCustomResponse: question.allowsCustomResponse,
				options: [
					...question.options.map((option, index) => ({
						optionId: `option-${index}`,
						name: option.description
							? `${option.label} — ${option.description}`
							: option.label,
						kind: "allow_once" as const,
					})),
					{ optionId: "skip", name: "Skip", kind: "reject_once" as const },
				],
				signal: context?.signal,
			});
			if (outcome.outcome !== "selected") {
				return { action: "cancelled", answers };
			}
			const answer: AskUserAnswer = {
				question: question.question,
				selectedLabels: selectedOptionIds(outcome)
					.filter((optionId) => optionId !== "skip")
					.map(
						(optionId) =>
							question.options[Number(optionId.slice("option-".length))]?.label,
					)
					.filter((label): label is string => label !== undefined),
			};
			const custom = customResponse(outcome);
			if (custom !== null) answer.customResponse = custom;
			answers.push(answer);
		}
		return { action: "answered", answers };
	}

	/** Park one synthetic question card and block until it is answered. */
	private parkQuestionCard(
		runtime: AcpSessionRuntime,
		input: {
			toolCallId: string;
			title: string;
			options: PermissionOption[];
			multiSelect?: boolean;
			allowsCustomResponse?: boolean;
			signal?: AbortSignal;
		},
	): Promise<RequestPermissionOutcome> {
		const requestId = randomUUID();
		const pending: PendingPermission = {
			requestId,
			toolCall: {
				toolCallId: input.toolCallId,
				// fold merges this over the adapter's tool_call frame, so the card
				// title becomes the question itself.
				title: input.title,
				kind: "other",
				status: "pending",
			},
			options: input.options,
			requestedAt: Date.now(),
			isElicitation: true,
			...(input.multiSelect ? { multiSelect: true } : {}),
			...(input.allowsCustomResponse ? { allowsCustomResponse: true } : {}),
		};
		runtime.state.pendingPermissions = [
			...runtime.state.pendingPermissions,
			pending,
		];
		this.journalFrame(runtime, { kind: "permission_requested", pending });
		this.syncStatus(runtime, { force: true });
		return new Promise<RequestPermissionOutcome>((resolve) => {
			runtime.pendingResolvers.set(requestId, resolve);
			// The adapter aborts the elicitation when the turn ends unanswered
			// (session/cancel, turn error) — settle so nothing leaks. The signal
			// may already be aborted (listeners on an aborted signal never fire),
			// so check first.
			const settleCancelled = () =>
				this.settlePermission(runtime, requestId, { outcome: "cancelled" });
			if (!input.signal) return;
			if (input.signal.aborted) {
				settleCancelled();
				return;
			}
			input.signal.addEventListener("abort", settleCancelled);
		});
	}

	/** Single resolution path for a parked permission; false when already settled. */
	private settlePermission(
		runtime: AcpSessionRuntime,
		requestId: string,
		outcome: RequestPermissionOutcome,
	): boolean {
		const resolver = runtime.pendingResolvers.get(requestId);
		if (!resolver) return false;
		runtime.pendingResolvers.delete(requestId);
		runtime.state.pendingPermissions = runtime.state.pendingPermissions.filter(
			(pending) => pending.requestId !== requestId,
		);
		this.journalFrame(runtime, {
			kind: "permission_resolved",
			requestId,
			outcome,
		});
		this.syncStatus(runtime, { force: true });
		resolver(outcome);
		return true;
	}

	// -------------------------------------------------------------------------
	// State snapshots + journal fanout
	// -------------------------------------------------------------------------

	private journalFrame(
		runtime: AcpSessionRuntime,
		frame: SessionUpdateFrame,
	): SessionUpdateEnvelope {
		if (frame.kind === "update" && "rawOutput" in frame.update) {
			const update = frame.update;
			if (update.rawOutput !== undefined) {
				frame = {
					...frame,
					update: {
						...update,
						rawOutput: this.artifactStore
							? this.artifactStore.boundRawOutput(
									runtime.state.sessionId,
									update.rawOutput,
								)
							: update.rawOutput,
					},
				};
			}
		}
		const envelope = runtime.journal.append(runtime.state.sessionId, frame);
		try {
			this.persistence?.appendEnvelope(envelope);
		} catch (error) {
			console.error(
				"[acp-sessions] failed to durably append journal envelope",
				error,
			);
		}
		for (const subscriber of runtime.subscribers) {
			try {
				subscriber(envelope);
			} catch (error) {
				console.warn("[acp-sessions] subscriber threw on envelope", error);
			}
		}
		return envelope;
	}

	/** Append a durable command lifecycle frame without exposing it as chat. */
	private journalRemoteCommand(
		runtime: AcpSessionRuntime,
		frame: Omit<RemoteCommandFrame, "kind">,
	): SessionUpdateEnvelope {
		return this.journalFrame(runtime, { kind: "remote_command", ...frame });
	}

	/**
	 * Commit the first durable command frame together with its idempotency key.
	 * The SQLite implementation is atomic; the fallback keeps injected legacy
	 * persistence implementations compatible while still failing closed on an
	 * append error.
	 */
	private reserveAndJournalRemoteCommand(
		runtime: AcpSessionRuntime,
		frame: Omit<RemoteCommandFrame, "kind">,
	): boolean {
		const envelope = runtime.journal.prepare(runtime.state.sessionId, {
			kind: "remote_command",
			...frame,
		});
		const persistence = this.persistence;
		if (persistence) {
			if (persistence.reserveCommandAndAppendEnvelope) {
				if (
					!persistence.reserveCommandAndAppendEnvelope(
						runtime.state.sessionId,
						frame.commandId,
						envelope,
					)
				) {
					return false;
				}
			} else {
				if (
					!persistence.reserveCommand(runtime.state.sessionId, frame.commandId)
				) {
					return false;
				}
				try {
					persistence.appendEnvelope(envelope);
				} catch (error) {
					persistence.releaseCommand(runtime.state.sessionId, frame.commandId);
					throw error;
				}
			}
		}
		runtime.journal.commitPrepared(envelope);
		for (const subscriber of runtime.subscribers) {
			try {
				subscriber(envelope);
			} catch (error) {
				console.warn("[acp-sessions] subscriber threw on envelope", error);
			}
		}
		return true;
	}

	private finishRemoteCommand(
		runtime: AcpSessionRuntime,
		commandId: string,
		operation: RemoteCommandOperation,
		prompt: ContentBlock[],
		queueId: string,
		enqueuedAt: number,
		outcome: RemoteCommandOutcome,
	): void {
		this.journalRemoteCommand(runtime, {
			commandId,
			operation,
			status: "finished",
			prompt: [...prompt],
			queueId,
			enqueuedAt,
			outcome,
		});
	}

	private computeStatus(runtime: AcpSessionRuntime): SessionStatus {
		if (runtime.dead) return "dead";
		if (runtime.state.pendingPermissions.length > 0) {
			return "awaiting_permission";
		}
		if (runtime.activePromptCount > 0) return "running";
		return "idle";
	}

	private syncStatus(
		runtime: AcpSessionRuntime,
		options?: { force?: boolean },
	): void {
		const next = this.computeStatus(runtime);
		if (next !== runtime.state.status || options?.force) {
			runtime.state.status = next;
			this.emitState(runtime);
		} else {
			this.scheduleIdleHibernate(runtime);
		}
	}

	private emitState(runtime: AcpSessionRuntime): void {
		if (runtime.closed) return;
		runtime.state.updatedAt = Date.now();
		this.journalFrame(runtime, {
			kind: "state",
			// The snapshot rides in the next envelope — lastSeq is that seq.
			state: {
				...this.snapshotState(runtime),
				lastSeq: runtime.journal.latestSeq + 1,
			},
		});
		// Every state emit refreshes the registry row (create, title change,
		// turn end, death) — best-effort; the live path never depends on it.
		this.persistState(runtime);
		this.notifySessionChange({
			sessionId: runtime.state.sessionId,
			workspaceId: runtime.state.workspaceId,
			eventType: "changed",
			status: runtime.state.status,
			occurredAt: Date.now(),
		});
		this.scheduleIdleHibernate(runtime);
	}

	/**
	 * Subscribe to host-wide session status transitions. Callers get one call
	 * per state emit and one final `deleted` on close. Failures in a listener
	 * are contained so a bad subscriber can't take the manager with it.
	 */
	onSessionChanged(listener: AcpSessionChangeHandler): () => void {
		this.sessionChangeListeners.add(listener);
		return () => {
			this.sessionChangeListeners.delete(listener);
		};
	}

	// Superset MCP tools run in the detached daemon, which owns presentation
	// request emission. In-process managers expose the same optional runtime
	// shape but have no renderer bridge.
	onSessionOpenRequested(_listener: AcpSessionOpenRequestHandler): () => void {
		return () => {};
	}

	onMergeRequestOpenRequested(
		_listener: AcpMergeRequestOpenRequestHandler,
	): () => void {
		return () => {};
	}

	private notifySessionChange(
		event: Parameters<AcpSessionChangeHandler>[0],
	): void {
		for (const listener of this.sessionChangeListeners) {
			try {
				listener(event);
			} catch (error) {
				console.warn("[acp-sessions] session-change listener threw", error);
			}
		}
	}

	private persistState(runtime: AcpSessionRuntime): void {
		if (!this.persistence) return;
		try {
			this.persistence.upsert({
				sessionId: runtime.state.sessionId,
				workspaceId: runtime.state.workspaceId,
				acpSessionId: runtime.acpSessionId,
				epoch: runtime.state.epoch,
				role: runtime.role,
				harness: runtime.state.harness,
				cwd: runtime.state.cwd,
				title: runtime.state.title,
				lastStopReason: runtime.state.lastStopReason,
				lastCompletedAt: runtime.state.lastCompletedAt,
				createdAt: runtime.state.createdAt,
				updatedAt: runtime.state.updatedAt,
			});
		} catch (error) {
			console.warn("[acp-sessions] failed to persist session row", error);
		}
	}

	private persistedLastCompletedAt(record: AcpSessionRecord): number | null {
		if (record.lastCompletedAt !== undefined) return record.lastCompletedAt;
		let latest: number | null = null;
		let turnWasActive = false;
		let turnWasRejected = false;
		try {
			for (const envelope of this.persistence?.loadJournal(
				record.sessionId,
				record.epoch,
			) ?? []) {
				if (envelope.frame.kind === "prompt_rejected") {
					turnWasRejected = true;
					continue;
				}
				if (envelope.frame.kind !== "state") continue;
				const state = envelope.frame.state;
				if (typeof state.lastCompletedAt === "number") {
					latest = Math.max(latest ?? 0, state.lastCompletedAt);
				}
				if (
					state.status === "starting" ||
					state.status === "running" ||
					state.status === "awaiting_permission"
				) {
					turnWasActive = true;
				} else if (turnWasActive) {
					if (!turnWasRejected && state.lastStopReason !== null) {
						latest = Math.max(latest ?? 0, envelope.ts);
					}
					turnWasActive = false;
					turnWasRejected = false;
				}
			}
		} catch (error) {
			console.warn(
				`[acp-sessions] failed to derive completion time for ${record.sessionId}`,
				error,
			);
		}
		record.lastCompletedAt = latest;
		return latest;
	}

	/** Synthesized snapshot for a persisted session with no adapter attached. */
	private offlineState(record: AcpSessionRecord): SessionScopedState {
		let queuedPrompts: QueuedPrompt[] = [];
		try {
			const entries =
				this.persistence?.loadJournal(record.sessionId, record.epoch) ?? [];
			const replayed = replayRemoteCommands(entries);
			queuedPrompts = orderReplayedRemoteQueue(replayed.queued, entries).map(
				(command) => ({
					queueId: command.queueId,
					prompt: [...command.prompt],
					enqueuedAt: command.enqueuedAt,
				}),
			);
		} catch (error) {
			console.warn(
				`[acp-sessions] failed to replay queued commands for ${record.sessionId}`,
				error,
			);
		}
		return {
			sessionId: record.sessionId,
			epoch: record.epoch,
			workspaceId: record.workspaceId,
			harness: record.harness,
			status: "offline",
			title: record.title,
			currentMode: null,
			configOptions: [],
			availableCommands: null,
			pendingPermissions: [],
			queuedPrompts,
			cwd: record.cwd,
			lastSeq: 0,
			lastStopReason: record.lastStopReason,
			lastCompletedAt: this.persistedLastCompletedAt(record),
			lastError: null,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};
	}

	private snapshotState(runtime: AcpSessionRuntime): SessionScopedState {
		return {
			...runtime.state,
			currentMode: runtime.state.currentMode
				? { ...runtime.state.currentMode }
				: null,
			configOptions: [...runtime.state.configOptions],
			availableCommands: cloneAvailableCommands(
				runtime.state.availableCommands,
			),
			pendingPermissions: runtime.state.pendingPermissions.map((pending) => ({
				...pending,
			})),
			queuedPrompts: runtime.state.queuedPrompts.map((queued) => ({
				...queued,
				prompt: [...queued.prompt],
			})),
			lastSeq: runtime.journal.latestSeq,
		};
	}

	private require(sessionId: string): AcpSessionRuntime {
		const runtime = this.runtimes.get(sessionId);
		if (!runtime) {
			throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
		}
		return runtime;
	}

	private requireLive(sessionId: string): AcpSessionRuntime {
		const runtime = this.require(sessionId);
		if (runtime.dead) {
			throw new AcpSessionDeadError(
				`ACP session ${sessionId} is dead${
					runtime.state.lastError ? `: ${runtime.state.lastError}` : ""
				}`,
			);
		}
		this.clearIdleHibernate(runtime);
		return runtime;
	}
}

/** ACP command metadata contains nested input/meta objects; state snapshots
 * must not leak mutable references to callers or journal frames. */
function cloneAvailableCommands(
	commands: AvailableCommand[] | null,
): AvailableCommand[] | null {
	return commands === null ? null : structuredClone(commands);
}
