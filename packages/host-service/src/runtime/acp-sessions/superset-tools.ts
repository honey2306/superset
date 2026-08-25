import { randomUUID } from "node:crypto";
import type {
	HarnessKind,
	MessagesPage,
	SessionScopedState,
} from "@superset/session-protocol";
import {
	type DelegationContextSnapshot,
	type DelegationResult,
	decodeMessagesCursor,
	encodeMessagesCursor,
	SUPERSET_DELEGATED_EXECUTOR_ROLE,
	SUPERSET_ROOT_COORDINATOR_ROLE,
	type SupersetAgent,
	type SupersetDelegationProfileSummary,
	type SupersetToolRequest,
	supersetToolRequestSchema,
} from "@superset/session-protocol";
import type { DelegationProfileTarget } from "../../trpc/router/settings/delegated-execution-target";
import type { AcpSessionManager } from "./acp-sessions";
import type {
	DelegationRunPersistence,
	DelegationRunRecord,
} from "./persistence";

export interface AcpSessionOpenRequest {
	workspaceId: string;
	sessionId: string;
	sourceSessionId: string;
	/** Stable identity for this presentation request. */
	requestId: string;
	harness: HarnessKind;
	reason:
		| "context_limit"
		| "parallel_task"
		| "fresh_start"
		| "delegation"
		| "open_session";
	occurredAt: number;
}

export interface MergeRequestOpenRequest {
	workspaceId: string;
	sourceSessionId: string;
	provider: "kdev";
	url: string;
	sourceBranch: string;
	occurredAt: number;
}

export type SetProjectRunCommandResult =
	| { status: "configured"; commands: string[] }
	| { status: "already_configured"; commands: string[] };

export type DelegatedExecutionResolution =
	| ({ enabled: false } & DelegatedExecutionProfileState)
	| ({
			enabled: true;
			valid: false;
			error: string;
	  } & DelegatedExecutionProfileState)
	| ({
			enabled: true;
			valid: true;
			agent: SupersetAgent;
			model: string | null;
	  } & DelegatedExecutionProfileState);

interface DelegatedExecutionProfileState {
	profiles?: DelegationProfileTarget[];
	profilesConfigured?: boolean;
}

export interface SupersetToolControllerOptions {
	manager: AcpSessionManager;
	onOpenRequested?: (event: AcpSessionOpenRequest) => void;
	/** Resolves only the current session's KDev create-MR page. */
	openMergeRequest?: (input: {
		cwd: string;
	}) => Promise<{ provider: "kdev"; url: string; sourceBranch: string }>;
	onMergeRequestOpenRequested?: (event: MergeRequestOpenRequest) => void;
	setProjectRunCommand?: (input: {
		workspaceId: string;
		commands: string[];
	}) => Promise<SetProjectRunCommandResult> | SetProjectRunCommandResult;
	resolveTargetWorkspace?: (input: {
		sourceWorkspaceId: string;
		workspaceId?: string;
		projectId?: string;
		projectPath?: string;
	}) => Promise<string> | string;
	resolveDelegatedExecution?: () => DelegatedExecutionResolution;
	/** Optional to preserve in-process/legacy controller construction. */
	delegationRuns?: DelegationRunPersistence;
}

const AGENT_TO_HARNESS = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
	deepseek: "deepseek-acp",
} as const satisfies Record<SupersetAgent, HarnessKind>;

/**
 * `get_session_messages` is model-facing, so its result is serialized once
 * by the daemon and once again by the MCP bridge. Keep the inner result well
 * below the daemon's 16 MiB line limit even when a provider repeats it in a
 * subsequent ACP message.
 */
export const MAX_MODEL_HISTORY_RESULT_BYTES = 512 * 1024;
const MAX_MODEL_HISTORY_ITEM_BYTES = 128 * 1024;
const MAX_MODEL_HISTORY_TEXT_BYTES = 16 * 1024;
const MAX_MODEL_HISTORY_DEPTH = 12;
const MAX_MODEL_HISTORY_ARRAY_ITEMS = 100;
const MIN_BINARY_STRING_BYTES = 1_024;

function serializedBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function likelyBase64(value: string): boolean {
	const compact = value.replace(/\s+/g, "");
	return (
		compact.length >= MIN_BINARY_STRING_BYTES &&
		/^[A-Za-z0-9+/]+={0,2}$/.test(compact)
	);
}

function binaryPlaceholder(value: string, type = "binary"): string {
	return `[${type} data omitted (${Buffer.byteLength(value)} bytes)]`;
}

function omitEmbeddedBinaryRuns(value: string): string {
	return value.replace(/[A-Za-z0-9+/]{1024,}={0,2}/g, (binary) =>
		binaryPlaceholder(binary),
	);
}

function truncateHistoryText(value: string): string {
	const bytes = Buffer.byteLength(value);
	if (bytes <= MAX_MODEL_HISTORY_TEXT_BYTES) return value;
	const marker = ` …[truncated ${bytes - MAX_MODEL_HISTORY_TEXT_BYTES} bytes]… `;
	const available = Math.max(
		0,
		MAX_MODEL_HISTORY_TEXT_BYTES - Buffer.byteLength(marker),
	);
	const headBytes = Math.floor(available * 0.7);
	let head = value.slice(0, headBytes);
	while (Buffer.byteLength(head) > headBytes) head = head.slice(0, -1);
	let tail = value.slice(value.length - (available - Buffer.byteLength(head)));
	while (
		Buffer.byteLength(`${head}${marker}${tail}`) > MAX_MODEL_HISTORY_TEXT_BYTES
	) {
		tail = tail.slice(1);
	}
	return `${head}${marker}${tail}`;
}

function sanitizeHistoryString(value: string, depth: number): string {
	const bytes = Buffer.byteLength(value);
	const trimmed = value.trim();
	if (bytes < MIN_BINARY_STRING_BYTES) return value;

	// The Pi bridge stores MCP tool results as a JSON string inside an ACP text
	// chunk. Parse that representation so images nested under `items[].frame`
	// are removed instead of merely truncating an opaque blob.
	if (
		depth < MAX_MODEL_HISTORY_DEPTH &&
		(trimmed.startsWith("{") || trimmed.startsWith("["))
	) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			const sanitized = sanitizeHistoryValue(parsed, depth + 1);
			const serialized = JSON.stringify(sanitized);
			if (serialized !== undefined) return truncateHistoryText(serialized);
		} catch {
			// Keep ordinary prose that happens to start with `{`/`[` intact below.
		}
	}

	if (/^data:[^;,]+;base64,/i.test(trimmed)) {
		return binaryPlaceholder(value, "media");
	}
	if (likelyBase64(value)) return binaryPlaceholder(value);
	return truncateHistoryText(omitEmbeddedBinaryRuns(value));
}

function sanitizeHistoryValue(value: unknown, depth = 0): unknown {
	if (typeof value === "string") return sanitizeHistoryString(value, depth);
	if (
		value === null ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (depth >= MAX_MODEL_HISTORY_DEPTH) return "[nested history value omitted]";
	if (Array.isArray(value)) {
		const visible = value
			.slice(0, MAX_MODEL_HISTORY_ARRAY_ITEMS)
			.map((entry) => sanitizeHistoryValue(entry, depth + 1));
		if (value.length > MAX_MODEL_HISTORY_ARRAY_ITEMS) {
			visible.push(
				`[${value.length - MAX_MODEL_HISTORY_ARRAY_ITEMS} history values omitted]`,
			);
		}
		return visible;
	}
	if (!isRecord(value)) return String(value);

	const type = typeof value.type === "string" ? value.type : undefined;
	const binaryType =
		type === "image" || type === "audio" || type === "resource"
			? type
			: undefined;
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (
			binaryType !== undefined &&
			(key === "data" || key === "blob") &&
			typeof child === "string" &&
			Buffer.byteLength(child) >= MIN_BINARY_STRING_BYTES
		) {
			result[key] = binaryPlaceholder(child, binaryType);
			continue;
		}
		result[key] = sanitizeHistoryValue(child, depth + 1);
	}
	return result;
}

function isModelHistoryMessageFrame(frame: unknown): boolean {
	if (!isRecord(frame)) return false;
	// Keep compatibility with the lightweight frame shape used by older
	// callers/tests while enforcing message-only projection for real frames.
	if (
		frame.kind === "agent_message_chunk" ||
		frame.kind === "user_message_chunk" ||
		frame.kind === "agent_thought_chunk"
	)
		return true;
	if (frame.kind !== "update" || !isRecord(frame.update)) return false;
	const sessionUpdate = frame.update.sessionUpdate;
	return (
		sessionUpdate === "user_message_chunk" ||
		sessionUpdate === "agent_message_chunk" ||
		sessionUpdate === "agent_thought_chunk"
	);
}

function compactOversizedHistoryEnvelope(envelope: unknown): unknown {
	if (!isRecord(envelope)) return envelope;
	const frame = isRecord(envelope.frame) ? envelope.frame : null;
	const update = frame && isRecord(frame.update) ? frame.update : null;
	const originalKind =
		(typeof frame?.kind === "string" && frame.kind) || "unknown";
	const originalUpdate =
		(typeof update?.sessionUpdate === "string" && update.sessionUpdate) ||
		"unknown";
	return {
		seq: envelope.seq,
		epoch: envelope.epoch,
		sessionId: envelope.sessionId,
		ts: envelope.ts,
		frame: {
			kind: "update",
			update: {
				sessionUpdate: "agent_message_chunk",
				content: {
					type: "text",
					text: `[History frame truncated: ${originalKind}/${originalUpdate} exceeded the model history item budget; binary content omitted.]`,
				},
			},
		},
	};
}

function projectHistoryEnvelope(envelope: unknown): unknown {
	const sanitized = sanitizeHistoryValue(envelope);
	if (serializedBytes(sanitized) <= MAX_MODEL_HISTORY_ITEM_BYTES) {
		return sanitized;
	}
	return compactOversizedHistoryEnvelope(envelope);
}

/**
 * Project durable ACP history into a bounded, text-oriented model payload.
 * Tool calls are deliberately omitted: their raw output is the common source
 * of screenshots and MCP JSON being recursively re-inserted into history.
 * Cursors are moved to the oldest returned seq whenever older page items had
 * to be dropped for the byte budget, so callers never retry the same page.
 */
export function projectModelHistoryPage(page: MessagesPage): {
	items: unknown[];
	nextCursor: string | null;
} {
	const projected = page.items
		.filter((item) => isModelHistoryMessageFrame(item.frame))
		.map((item) => projectHistoryEnvelope(item));
	if (projected.length === 0) {
		return { items: [], nextCursor: page.nextCursor };
	}

	const selected: unknown[] = [];
	let droppedOlderItems = false;
	for (let index = projected.length - 1; index >= 0; index -= 1) {
		const candidate = [projected[index], ...selected];
		const candidatePage = { items: candidate, nextCursor: page.nextCursor };
		if (
			selected.length === 0 ||
			serializedBytes(candidatePage) <= MAX_MODEL_HISTORY_RESULT_BYTES
		) {
			selected.splice(0, selected.length, ...candidate);
			continue;
		}
		droppedOlderItems = true;
		break;
	}

	if (!droppedOlderItems) {
		return { items: selected, nextCursor: page.nextCursor };
	}
	const oldestReturned = selected[0];
	const seq = isRecord(oldestReturned) ? oldestReturned.seq : undefined;
	if (typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 1) {
		return { items: selected, nextCursor: encodeMessagesCursor(seq) };
	}
	return { items: selected, nextCursor: page.nextCursor };
}

function projectSession(state: SessionScopedState) {
	return {
		sessionId: state.sessionId,
		harness: state.harness,
		status: state.status,
		title: state.title,
		lastStopReason: state.lastStopReason,
		lastError: state.lastError,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
	};
}

function textPrompt(text: string) {
	return [{ type: "text" as const, text }];
}

type DelegationTerminalStatus = "completed" | "cancelled" | "interrupted";

type DelegationWaiter = {
	resolve: (value: Record<string, unknown>) => void;
	reject: (reason: Error) => void;
};

function parseJsonObject(
	json: string | null | undefined,
): Record<string, unknown> | null {
	if (!json) return null;
	try {
		const value: unknown = JSON.parse(json);
		return typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
	}
	if (typeof value === "object" && value !== null) {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

function delegationStatusForStopReason(
	stopReason: string,
): DelegationTerminalStatus {
	if (stopReason === "cancelled" || stopReason === "cancel") return "cancelled";
	if (stopReason === "interrupted") return "interrupted";
	return "completed";
}

function isTerminalDelegationStatus(
	status: DelegationRunRecord["status"],
): boolean {
	return (
		status === "completed" ||
		status === "cancelled" ||
		status === "interrupted" ||
		status === "failed"
	);
}

function delegationWaitResult(
	run: DelegationRunRecord,
): Record<string, unknown> {
	return {
		delegationRunId: run.id,
		sessionId: run.childSessionId,
		workspaceId: run.childWorkspaceId,
		status: run.status,
		failureMessage: run.failureMessage,
		completedAt: run.completedAt,
		failedAt: run.failedAt,
		actualAgent: run.actualAgent,
		actualModel: run.actualModel,
		harness: run.harness,
		result: parseJsonObject(run.resultJson),
	};
}

interface ChildLaunchRecord {
	child: Promise<SessionScopedState>;
	prompt: Promise<void>;
	openRequested: boolean;
	actualAgent: string | null;
	actualModel: string | null;
	harness: HarnessKind;
	childSessionId: string;
	delegationRunId: string | null;
	profileId: string | null;
	profileName: string | null;
	profileInstructions: string | null;
	promptText: string;
	childWorkspaceId: string;
}

/**
 * Executes the host-owned semantics behind the bundled Superset MCP server.
 * Session inspection/control stays scoped to the source workspace; new child
 * sessions may optionally target another known workspace/project.
 */
export class SupersetToolController {
	private readonly manager: AcpSessionManager;
	private readonly onOpenRequested: SupersetToolControllerOptions["onOpenRequested"];
	private readonly openMergeRequest: SupersetToolControllerOptions["openMergeRequest"];
	private readonly onMergeRequestOpenRequested: SupersetToolControllerOptions["onMergeRequestOpenRequested"];
	private readonly setProjectRunCommand: SupersetToolControllerOptions["setProjectRunCommand"];
	private readonly resolveTargetWorkspace: SupersetToolControllerOptions["resolveTargetWorkspace"];
	private readonly resolveDelegatedExecution: SupersetToolControllerOptions["resolveDelegatedExecution"];
	private readonly delegationRuns: SupersetToolControllerOptions["delegationRuns"];
	private readonly childByIdempotencyKey = new Map<string, ChildLaunchRecord>();
	private readonly delegationRunByChildSessionId = new Map<string, string>();
	private readonly delegationWaiters = new Map<string, Set<DelegationWaiter>>();

	constructor(options: SupersetToolControllerOptions) {
		this.manager = options.manager;
		this.onOpenRequested = options.onOpenRequested;
		this.openMergeRequest = options.openMergeRequest;
		this.onMergeRequestOpenRequested = options.onMergeRequestOpenRequested;
		this.setProjectRunCommand = options.setProjectRunCommand;
		this.resolveTargetWorkspace = options.resolveTargetWorkspace;
		this.resolveDelegatedExecution = options.resolveDelegatedExecution;
		this.delegationRuns = options.delegationRuns;
		if (this.delegationRuns) {
			for (const run of this.delegationRuns.listActiveDelegationRuns()) {
				this.delegationRunByChildSessionId.set(run.childSessionId, run.id);
				this.reconcileDelegationRun(run.childSessionId);
			}
			this.manager.onSessionChanged?.((event) => {
				this.reconcileDelegationRun(event.sessionId);
			});
		}
	}

	/**
	 * Resolve the host-wide delegated executor without requiring a live source
	 * session. MCP servers ask for this while their parent adapter is still
	 * inside `session/new`, before the manager has published the runtime.
	 */
	getDelegatedExecution(): DelegatedExecutionResolution {
		return this.resolveDelegatedExecution?.() ?? { enabled: false };
	}

	async execute(
		input: unknown,
		signal?: AbortSignal,
	): Promise<Record<string, unknown>> {
		const request = supersetToolRequestSchema.parse(input);
		const source = this.manager.get(request.sourceSessionId);
		if (
			request.name === "delegate" &&
			this.manager.getRole?.(request.sourceSessionId) ===
				SUPERSET_DELEGATED_EXECUTOR_ROLE
		) {
			throw new Error("Delegated executor sessions cannot delegate again");
		}

		switch (request.name) {
			case "get_context": {
				const siblings = this.manager.list({
					workspaceId: source.workspaceId,
					limit: 100,
				});
				const delegatedExecution = this.getDelegatedExecution();
				return {
					workspaceId: source.workspaceId,
					cwd: source.cwd,
					currentSession: projectSession(source),
					sessions: siblings.items.map(projectSession),
					delegatedExecution,
					delegationProfiles: (delegatedExecution.profiles ?? []).map(
						(profile): SupersetDelegationProfileSummary => ({
							id: profile.id,
							name: profile.name,
							description: profile.description,
							enabled: profile.enabled,
							valid: profile.enabled && profile.valid,
							...(profile.agent ? { agent: profile.agent } : {}),
							...(profile.model !== undefined ? { model: profile.model } : {}),
						}),
					),
				};
			}
			case "list_sessions": {
				const page = this.manager.list({
					workspaceId: source.workspaceId,
					limit: request.arguments.limit,
				});
				return {
					workspaceId: source.workspaceId,
					items: page.items.map(projectSession),
					nextCursor: page.nextCursor,
				};
			}
			case "get_session_status": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				return projectSession(target);
			}
			case "open_session": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				const requestId = randomUUID();
				let openRequested = false;
				try {
					if (this.onOpenRequested) {
						this.onOpenRequested({
							workspaceId: source.workspaceId,
							sessionId: target.sessionId,
							sourceSessionId: source.sessionId,
							requestId,
							harness: target.harness,
							reason: "open_session",
							occurredAt: Date.now(),
						});
						openRequested = true;
					}
				} catch {
					// Presentation is best-effort. The target was already authorized
					// and remains available even when Desktop is disconnected.
				}
				return {
					sessionId: target.sessionId,
					workspaceId: target.workspaceId,
					status: target.status,
					title: target.title,
					openRequested,
					requestId,
				};
			}
			case "get_session_messages": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				const beforeSeq = request.arguments.cursor
					? decodeMessagesCursor(request.arguments.cursor)
					: undefined;
				if (beforeSeq === null) {
					throw new Error("Invalid messages cursor");
				}
				const page = await this.manager.getMessages({
					sessionId: target.sessionId,
					beforeSeq,
					limit: request.arguments.limit,
				});
				return projectModelHistoryPage(page);
			}
			case "send_message": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				await this.manager.ensureLive(target.sessionId);
				const result = this.manager.enqueuePrompt({
					sessionId: target.sessionId,
					commandId: randomUUID(),
					prompt: textPrompt(request.arguments.message),
				});
				return {
					sessionId: target.sessionId,
					status: target.status,
					...result,
				};
			}
			case "continue_in_new_session":
				return this.createChild(request, source, {
					prompt: request.arguments.handoff,
					reason: request.arguments.reason,
				});
			case "delegate":
				return this.createChild(request, source, {
					prompt: request.arguments.task,
					reason: "delegation",
					contextSnapshot: request.arguments.contextSnapshot,
				});
			case "wait_delegation":
				return this.waitForDelegation(
					source,
					request.arguments.delegationRunId,
					signal,
				);
			case "report_delegation_result":
				return this.reportDelegationResult(
					source,
					request.arguments.delegationRunId,
					request.arguments.result,
				);
			case "ask_user":
				return this.manager.askUser({
					sessionId: source.sessionId,
					questions: request.arguments.questions,
					signal,
				});
			case "set_project_run_command": {
				if (!this.setProjectRunCommand) {
					throw new Error("Project run command configuration is unavailable");
				}
				return this.setProjectRunCommand({
					workspaceId: source.workspaceId,
					commands: request.arguments.commands,
				});
			}
			case "update_plan": {
				const envelope = this.manager.updatePlan({
					sessionId: source.sessionId,
					entries: request.arguments.plan.map((entry) => ({
						content: entry.step,
						status: entry.status,
					})),
					explanation: request.arguments.explanation,
				});
				return {
					updated: true,
					sessionId: source.sessionId,
					seq: envelope.seq,
				};
			}
			case "open_merge_request": {
				if (!this.openMergeRequest) {
					throw new Error(
						"Merge request opening is unavailable in this runtime",
					);
				}
				const mergeRequest = await this.openMergeRequest({ cwd: source.cwd });
				this.onMergeRequestOpenRequested?.({
					workspaceId: source.workspaceId,
					sourceSessionId: source.sessionId,
					...mergeRequest,
					occurredAt: Date.now(),
				});
				return {
					provider: mergeRequest.provider,
					sourceBranch: mergeRequest.sourceBranch,
					opened: true,
				};
			}
			default:
				throw new Error("Unsupported Superset tool");
		}
	}

	private reportDelegationResult(
		source: SessionScopedState,
		delegationRunId: string,
		result: DelegationResult,
	): Record<string, unknown> {
		if (
			this.manager.getRole?.(source.sessionId) !==
			SUPERSET_DELEGATED_EXECUTOR_ROLE
		) {
			throw new Error(
				"Only delegated executor sessions can report delegation results",
			);
		}
		if (!this.delegationRuns) {
			throw new Error("Delegation persistence is unavailable");
		}
		const run = this.delegationRuns.getDelegationRun(delegationRunId);
		if (
			!run ||
			run.childSessionId !== source.sessionId ||
			run.childWorkspaceId !== source.workspaceId
		) {
			throw new Error("Delegation run is unavailable for this child session");
		}
		const resultJson = JSON.stringify(result);
		if (run.resultJson !== null && run.resultJson !== undefined) {
			if (
				canonicalJson(parseJsonObject(run.resultJson)) !== canonicalJson(result)
			) {
				throw new Error(
					"A different result was already reported for this delegation run",
				);
			}
			return {
				delegationRunId,
				accepted: true,
				result,
				idempotent: true,
			};
		}
		if (isTerminalDelegationStatus(run.status)) {
			throw new Error("Delegation run is already terminal");
		}
		this.delegationRuns.updateDelegationRun(delegationRunId, {
			resultJson,
			updatedAt: Date.now(),
		});
		return { delegationRunId, accepted: true, result };
	}

	private waitForDelegation(
		source: SessionScopedState,
		delegationRunId: string,
		signal?: AbortSignal,
	): Promise<Record<string, unknown>> {
		if (!this.delegationRuns) {
			throw new Error("Delegation persistence is unavailable");
		}
		const run = this.delegationRuns.getDelegationRun(delegationRunId);
		if (
			!run ||
			run.parentSessionId !== source.sessionId ||
			run.parentWorkspaceId !== source.workspaceId
		) {
			throw new Error("Delegation run is unavailable in the current session");
		}
		if (isTerminalDelegationStatus(run.status)) {
			return Promise.resolve(delegationWaitResult(run));
		}
		if (signal?.aborted) {
			return Promise.reject(new Error("Superset tool call cancelled"));
		}

		return new Promise<Record<string, unknown>>((resolve, reject) => {
			let settled = false;
			const onAbort = () => {
				if (settled) return;
				settled = true;
				this.removeDelegationWaiter(delegationRunId, waiter);
				reject(new Error("Superset tool call cancelled"));
			};
			const waiter: DelegationWaiter = {
				resolve: (value) => {
					if (settled) return;
					settled = true;
					cleanup();
					resolve(value);
				},
				reject: (error) => {
					if (settled) return;
					settled = true;
					cleanup();
					reject(error);
				},
			};
			const cleanup = () => {
				signal?.removeEventListener("abort", onAbort);
				this.removeDelegationWaiter(delegationRunId, waiter);
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			let waiters = this.delegationWaiters.get(delegationRunId);
			if (!waiters) {
				waiters = new Set();
				this.delegationWaiters.set(delegationRunId, waiters);
			}
			waiters.add(waiter);

			// Persistence is synchronous. Re-read after registering to close the
			// small race where the child completed immediately before the waiter
			// was installed. Completion notification remains event-driven.
			const current = this.delegationRuns?.getDelegationRun(delegationRunId);
			if (!current) {
				waiter.reject(new Error("Delegation run is no longer available"));
			} else if (isTerminalDelegationStatus(current.status)) {
				waiter.resolve(delegationWaitResult(current));
			}
		});
	}

	private removeDelegationWaiter(
		delegationRunId: string,
		waiter: DelegationWaiter,
	): void {
		const waiters = this.delegationWaiters.get(delegationRunId);
		if (!waiters) return;
		waiters.delete(waiter);
		if (waiters.size === 0) this.delegationWaiters.delete(delegationRunId);
	}

	private notifyDelegationWaiters(delegationRunId: string): void {
		if (!this.delegationRuns) return;
		const run = this.delegationRuns.getDelegationRun(delegationRunId);
		if (!run || !isTerminalDelegationStatus(run.status)) return;
		const waiters = this.delegationWaiters.get(delegationRunId);
		if (!waiters) return;
		this.delegationWaiters.delete(delegationRunId);
		for (const waiter of waiters) {
			waiter.resolve(delegationWaitResult(run));
		}
	}

	private async resolveChildWorkspace(
		request: Extract<
			SupersetToolRequest,
			{ name: "continue_in_new_session" | "delegate" }
		>,
		source: SessionScopedState,
	): Promise<string> {
		const { workspaceId, projectId, projectPath } = request.arguments;
		const targetCount = [workspaceId, projectId, projectPath].filter(
			Boolean,
		).length;
		if (targetCount > 1) {
			throw new Error(
				"Specify only one of workspaceId, projectId, or projectPath",
			);
		}
		if (targetCount === 0) return source.workspaceId;
		if (!this.resolveTargetWorkspace) {
			if (workspaceId) return workspaceId;
			throw new Error("Project target resolution is unavailable");
		}
		return this.resolveTargetWorkspace({
			sourceWorkspaceId: source.workspaceId,
			...(workspaceId ? { workspaceId } : {}),
			...(projectId ? { projectId } : {}),
			...(projectPath ? { projectPath } : {}),
		});
	}

	private getWorkspaceSession(
		source: SessionScopedState,
		targetSessionId: string,
	): SessionScopedState {
		let target: SessionScopedState;
		try {
			target = this.manager.get(targetSessionId);
		} catch {
			throw new Error("Session is unavailable in the current workspace");
		}
		if (target.workspaceId !== source.workspaceId) {
			throw new Error("Session is unavailable in the current workspace");
		}
		return target;
	}

	private async createChild(
		request: Extract<
			SupersetToolRequest,
			{ name: "continue_in_new_session" | "delegate" }
		>,
		source: SessionScopedState,
		input: {
			prompt: string;
			reason: AcpSessionOpenRequest["reason"];
			contextSnapshot?: DelegationContextSnapshot;
		},
	): Promise<Record<string, unknown>> {
		const targetWorkspaceId = await this.resolveChildWorkspace(request, source);
		const childInput = { ...input, targetWorkspaceId };
		const idempotencyKey = request.arguments.idempotencyKey
			? `${source.sessionId}:${request.name}:${targetWorkspaceId}:${request.arguments.idempotencyKey}`
			: null;
		let record = idempotencyKey
			? this.childByIdempotencyKey.get(idempotencyKey)
			: undefined;
		const reused = record !== undefined;
		if (!record) {
			record = this.startChild(request, source, childInput);
			if (request.name === "delegate" && this.delegationRuns) {
				const now = Date.now();
				record.delegationRunId = randomUUID();
				this.delegationRuns.createDelegationRun({
					id: record.delegationRunId,
					parentSessionId: source.sessionId,
					parentWorkspaceId: source.workspaceId,
					childSessionId: record.childSessionId,
					childWorkspaceId: record.childWorkspaceId,
					handoff: input.prompt,
					profileId: record.profileId,
					contextSnapshotJson: input.contextSnapshot
						? JSON.stringify(input.contextSnapshot)
						: null,
					resultJson: null,
					actualAgent: record.actualAgent,
					actualModel: record.actualModel,
					harness: record.harness,
					status: "creating",
					failureMessage: null,
					createdAt: now,
					startedAt: null,
					completedAt: null,
					failedAt: null,
					updatedAt: now,
				});
				this.delegationRunByChildSessionId.set(
					record.childSessionId,
					record.delegationRunId,
				);
				const createdRecord = record;
				void createdRecord.child.catch((error: unknown) => {
					this.markDelegationFailed(createdRecord, error);
				});
			}
			if (request.name === "delegate") {
				record.promptText = this.buildDelegatedPrompt(
					record,
					input.prompt,
					input.contextSnapshot,
				);
			} else {
				record.promptText = input.prompt;
			}
			record.prompt = this.promptChildForRecord(record, record.promptText);
			if (request.name === "delegate" && this.delegationRuns) {
				const createdRecord = record;
				void createdRecord.prompt.catch((error: unknown) => {
					this.markDelegationFailed(createdRecord, error);
				});
			}
			if (idempotencyKey) {
				this.childByIdempotencyKey.set(idempotencyKey, record);
				void record.child.catch(() => {
					if (this.childByIdempotencyKey.get(idempotencyKey) === record) {
						this.childByIdempotencyKey.delete(idempotencyKey);
					}
				});
			}
		} else {
			const failedPrompt = record.prompt;
			try {
				await failedPrompt;
			} catch {
				// Creation already succeeded. Retry prompt admission against the same
				// child instead of allocating duplicate delegated work.
				if (record.prompt === failedPrompt) {
					record.prompt = this.promptChildForRecord(record, record.promptText);
				}
			}
		}

		await record.prompt;
		const child = await record.child;
		if (request.arguments.focus && !record.openRequested) {
			record.openRequested = true;
			try {
				this.onOpenRequested?.({
					workspaceId: record.childWorkspaceId,
					sessionId: child.sessionId,
					sourceSessionId: source.sessionId,
					requestId: randomUUID(),
					harness: child.harness,
					reason: input.reason,
					occurredAt: Date.now(),
				});
			} catch {
				// Presentation is explicitly best-effort and must never turn a
				// successfully started child into a failed tool call.
			}
		}
		return {
			sessionId: child.sessionId,
			workspaceId: record.childWorkspaceId,
			reused,
			delegationRunId: record.delegationRunId,
			actualAgent: record.actualAgent,
			actualModel: record.actualModel,
		};
	}

	private startChild(
		request: Extract<
			SupersetToolRequest,
			{ name: "continue_in_new_session" | "delegate" }
		>,
		source: SessionScopedState,
		input: {
			prompt: string;
			reason: AcpSessionOpenRequest["reason"];
			contextSnapshot?: DelegationContextSnapshot;
			targetWorkspaceId: string;
		},
	): ChildLaunchRecord {
		const targetWorkspaceId = input.targetWorkspaceId;
		const selectedAgent =
			request.name === "continue_in_new_session"
				? (request.arguments.agent ?? "pi")
				: undefined;
		let actualAgent: string | null = selectedAgent ?? null;
		let actualModel: string | null = null;
		let harness = selectedAgent
			? AGENT_TO_HARNESS[selectedAgent]
			: source.harness;
		let profileId: string | null =
			request.name === "delegate"
				? (request.arguments.profileId ?? null)
				: null;
		let profileName: string | null = null;
		let profileInstructions: string | null = null;

		if (request.name === "delegate") {
			const delegatedExecution = this.getDelegatedExecution();
			const selectedProfile = this.selectDelegationProfile(
				delegatedExecution,
				request.arguments.profileId,
			);
			if (selectedProfile) {
				profileId = selectedProfile.id;
				profileName = selectedProfile.name;
				profileInstructions = selectedProfile.instructions;
				harness = AGENT_TO_HARNESS[selectedProfile.agent as SupersetAgent];
				actualAgent = selectedProfile.agent ?? null;
				actualModel = selectedProfile.model ?? null;
			} else if (delegatedExecution.enabled === false) {
				throw new Error("Delegated execution is disabled");
			} else if (!delegatedExecution.valid) {
				throw new Error(delegatedExecution.error);
			} else if (delegatedExecution.profiles === undefined) {
				// Legacy callers and in-process controllers may only provide the
				// original single target. Keep that path intact while profiles roll out.
				harness = AGENT_TO_HARNESS[delegatedExecution.agent];
				actualAgent = delegatedExecution.agent;
				actualModel = delegatedExecution.model;
			} else {
				throw new Error("Delegated execution target is unavailable");
			}
			if (!actualAgent || !AGENT_TO_HARNESS[actualAgent as SupersetAgent]) {
				throw new Error("The selected delegation profile has no ACP executor.");
			}
			harness = AGENT_TO_HARNESS[actualAgent as SupersetAgent];
			/*
			 * Profile-specific instructions are part of the child's task handoff,
			 * not parent-only context. This preserves the coordinator boundary while
			 * letting a profile specialize how the child approaches the task.
			 */
		}

		const childPrompt = input.prompt;
		const childSessionId = randomUUID();
		const child = this.manager.create({
			sessionId: childSessionId,
			workspaceId: targetWorkspaceId,
			harness,
			role:
				request.name === "delegate"
					? SUPERSET_DELEGATED_EXECUTOR_ROLE
					: SUPERSET_ROOT_COORDINATOR_ROLE,
			...(actualModel ? { model: actualModel, strictModel: true } : {}),
		});
		const childPromise = Promise.resolve(child);
		const record: ChildLaunchRecord = {
			child: childPromise,
			prompt: Promise.resolve(),
			openRequested: false,
			actualAgent,
			actualModel,
			harness,
			childSessionId,
			delegationRunId: null,
			profileId,
			profileName,
			profileInstructions,
			promptText: childPrompt,
			childWorkspaceId: targetWorkspaceId,
		};
		return record;
	}

	private promptChildForRecord(
		record: ChildLaunchRecord,
		prompt: string,
	): Promise<void> {
		return this.promptChild(record.child, prompt, {
			onAdmitted: () => this.markDelegationRunning(record),
			onTurn: (turn) => this.watchDelegationTurn(record, turn),
		});
	}

	private buildDelegatedPrompt(
		record: Pick<
			ChildLaunchRecord,
			"profileName" | "profileInstructions" | "delegationRunId"
		>,
		prompt: string,
		contextSnapshot?: DelegationContextSnapshot,
	): string {
		const profileText = record.profileInstructions
			? `Delegation profile: ${record.profileName ?? "configured profile"}\n\n${record.profileInstructions}\n\n`
			: "";
		const contextText = contextSnapshot
			? `\n\nFinite context snapshot (verify decision-critical facts):\n${JSON.stringify(contextSnapshot, null, 2)}`
			: "";
		const reportText = record.delegationRunId
			? `\n\nWhen the task is complete, call Superset report_delegation_result with delegationRunId '${record.delegationRunId}' before your final response.`
			: "";
		if (!profileText && !contextText && !reportText) return prompt;
		return `${profileText}Delegated task:\n${prompt}${contextText}${reportText}`;
	}

	private selectDelegationProfile(
		delegatedExecution: DelegatedExecutionResolution,
		profileId: string | undefined,
	): DelegationProfileTarget | null {
		const profiles = delegatedExecution.profiles;
		if (profiles === undefined) return null;
		if (!profileId && delegatedExecution.profilesConfigured) {
			throw new Error(
				"profileId is required when persisted delegation profiles are configured.",
			);
		}
		const selected = profileId
			? profiles.find((profile) => profile.id === profileId)
			: profiles.find((profile) => profile.enabled && profile.valid);
		if (!selected) {
			if (profileId) {
				throw new Error(`Delegation profile '${profileId}' is unavailable.`);
			}
			if (delegatedExecution.profilesConfigured) {
				throw new Error("No enabled valid delegation profile is available.");
			}
			return null;
		}
		if (!selected.enabled) {
			throw new Error(`Delegation profile '${selected.name}' is disabled.`);
		}
		if (!selected.valid) {
			throw new Error(
				selected.error ??
					`Delegation profile '${selected.name}' has an invalid executor target.`,
			);
		}
		if (!selected.agent) {
			throw new Error(`Delegation profile '${selected.name}' has no executor.`);
		}
		return selected;
	}

	private async promptChild(
		childPromise: Promise<SessionScopedState>,
		prompt: string,
		callbacks?: {
			onAdmitted: () => void;
			onTurn: (turn: Promise<{ stopReason: string }>) => void;
		},
	): Promise<void> {
		const child = await childPromise;
		const result = await this.manager.prompt({
			sessionId: child.sessionId,
			commandId: randomUUID(),
			prompt: textPrompt(prompt),
		});
		callbacks?.onAdmitted();
		if (result && "turn" in result && result.turn) {
			callbacks?.onTurn(result.turn);
		}
	}

	private markDelegationRunning(record: ChildLaunchRecord): void {
		if (!record.delegationRunId || !this.delegationRuns) return;
		const now = Date.now();
		this.delegationRunByChildSessionId.set(
			record.childSessionId,
			record.delegationRunId,
		);
		this.delegationRuns.updateDelegationRun(record.delegationRunId, {
			status: "running",
			startedAt: now,
			completedAt: null,
			failedAt: null,
			failureMessage: null,
			updatedAt: now,
		});
	}

	private watchDelegationTurn(
		record: ChildLaunchRecord,
		turn: Promise<{ stopReason: string }>,
	): void {
		void turn.then(
			(result) => this.markDelegationStopped(record, result.stopReason),
			(error: unknown) => this.markDelegationFailed(record, error),
		);
	}

	private markDelegationStopped(
		record: ChildLaunchRecord,
		stopReason: string,
	): void {
		if (!record.delegationRunId || !this.delegationRuns) return;
		if (
			this.delegationRunByChildSessionId.get(record.childSessionId) !==
			record.delegationRunId
		) {
			return;
		}
		const now = Date.now();
		const status = delegationStatusForStopReason(stopReason);
		this.delegationRuns.updateDelegationRun(record.delegationRunId, {
			status,
			completedAt: status === "completed" ? now : null,
			failedAt: null,
			failureMessage: null,
			updatedAt: now,
		});
		this.notifyDelegationWaiters(record.delegationRunId);
		this.delegationRunByChildSessionId.delete(record.childSessionId);
	}

	private markDelegationFailed(
		record: ChildLaunchRecord,
		error: unknown,
	): void {
		if (!record.delegationRunId || !this.delegationRuns) return;
		if (
			this.delegationRunByChildSessionId.get(record.childSessionId) !==
			record.delegationRunId
		) {
			return;
		}
		const now = Date.now();
		this.delegationRuns.updateDelegationRun(record.delegationRunId, {
			status: "failed",
			failureMessage: error instanceof Error ? error.message : String(error),
			completedAt: null,
			failedAt: now,
			updatedAt: now,
		});
		this.notifyDelegationWaiters(record.delegationRunId);
		this.delegationRunByChildSessionId.delete(record.childSessionId);
	}

	private reconcileDelegationRun(childSessionId: string): void {
		const runId = this.delegationRunByChildSessionId.get(childSessionId);
		if (!runId || !this.delegationRuns) return;
		let child: SessionScopedState;
		try {
			child = this.manager.get(childSessionId);
		} catch {
			return;
		}
		if (child.lastError) {
			const now = Date.now();
			this.delegationRuns.updateDelegationRun(runId, {
				status: "failed",
				failureMessage: child.lastError,
				completedAt: null,
				failedAt: now,
				updatedAt: now,
			});
			this.notifyDelegationWaiters(runId);
			this.delegationRunByChildSessionId.delete(childSessionId);
			return;
		}
		if (child.lastStopReason) {
			const now = Date.now();
			const status = delegationStatusForStopReason(child.lastStopReason);
			this.delegationRuns.updateDelegationRun(runId, {
				status,
				completedAt:
					status === "completed" ? (child.lastCompletedAt ?? now) : null,
				failedAt: null,
				failureMessage: null,
				updatedAt: now,
			});
			this.notifyDelegationWaiters(runId);
			this.delegationRunByChildSessionId.delete(childSessionId);
		}
	}
}
