import type {
	ContentBlock,
	EnqueuePromptResult,
	MessagesPage,
	PromptAccepted,
	RequestPermissionOutcome,
	RespondToPermissionResult,
	SessionScopedState,
	SessionStatus,
	SessionsPage,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";

type MaybePromise<T> = T | Promise<T>;

/**
 * Host-wide session-change event. Delivered to every registered listener on
 * every state transition and on `close`. See `AcpSessionRuntime#onSessionChanged`.
 */
export interface AcpSessionChangeEvent {
	sessionId: string;
	workspaceId: string;
	eventType: "changed" | "deleted";
	/** Absent for `deleted`. */
	status?: SessionStatus;
	occurredAt: number;
}

export type AcpSessionChangeHandler = (event: AcpSessionChangeEvent) => void;

export interface AcpSessionOpenRequestEvent {
	workspaceId: string;
	sessionId: string;
	sourceSessionId: string;
	harness: SessionScopedState["harness"];
	reason: "context_limit" | "parallel_task" | "fresh_start" | "delegation";
	occurredAt: number;
}

export type AcpSessionOpenRequestHandler = (
	event: AcpSessionOpenRequestEvent,
) => void;

/**
 * Host-facing ACP control surface. The in-process manager and the detached
 * daemon client both implement this contract; callers must await operations so
 * switching ownership across the process boundary is transparent.
 */
export interface AcpSessionRuntime {
	create(input: {
		sessionId: string;
		workspaceId: string;
		harness?: SessionScopedState["harness"];
	}): MaybePromise<SessionScopedState>;
	get(sessionId: string): MaybePromise<SessionScopedState>;
	list(input: {
		workspaceId?: string;
		cursor?: string;
		limit?: number;
	}): MaybePromise<SessionsPage>;
	ensureLive(sessionId: string): Promise<void>;
	getMessages(input: {
		sessionId: string;
		beforeSeq?: number;
		limit?: number;
	}): MaybePromise<MessagesPage>;
	prompt(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): MaybePromise<{ accepted: true }>;
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}): MaybePromise<RespondToPermissionResult>;
	cancel(input: { sessionId: string }): Promise<void>;
	close(input: { sessionId: string }): Promise<void>;
	setMode(input: { sessionId: string; modeId: string }): Promise<void>;
	setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void>;

	// ── Follow-up queue (host-managed) ────────────────────────────────
	enqueuePrompt(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): MaybePromise<EnqueuePromptResult>;
	sendNow(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): MaybePromise<PromptAccepted>;
	removeQueuedPrompt(input: {
		sessionId: string;
		queueId: string;
	}): MaybePromise<void>;
	reorderQueue(input: {
		sessionId: string;
		orderedIds: string[];
	}): MaybePromise<void>;
	editQueuedPrompt(input: {
		sessionId: string;
		queueId: string;
		prompt: ContentBlock[];
	}): MaybePromise<void>;
	clearQueue(input: { sessionId: string }): MaybePromise<void>;

	subscribe(input: {
		sessionId: string;
		since?: number;
		epoch?: string;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): MaybePromise<() => void>;
	/**
	 * Register a host-wide listener for session status transitions. Present
	 * on both the in-process manager and the daemon client; older daemons
	 * may never fire the callback, so callers must still recover on
	 * reconnect. Returns an unregister function.
	 */
	onSessionChanged?(handler: AcpSessionChangeHandler): () => void;
	/** Best-effort desktop presentation request emitted by Superset ACP tools. */
	onSessionOpenRequested?(handler: AcpSessionOpenRequestHandler): () => void;
	dispose(): Promise<void>;
}
