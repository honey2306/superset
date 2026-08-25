import type {
	ContentBlock,
	RequestPermissionOutcome,
	SessionUpdate,
} from "./acp";
import type { PendingPermission, SessionScopedState } from "./state";

/** A phone-originated command which must survive a host process restart. */
export type RemoteCommandOperation = "prompt" | "enqueuePrompt" | "sendNow";

/** Terminal reason for a durable command admission. */
export type RemoteCommandOutcome =
	| "admitted"
	| "removed"
	| "cleared"
	| "superseded"
	| "failed";

/**
 * Host-owned command lifecycle. These frames are transport/control metadata,
 * not conversation messages; clients advance their cursor over them but do
 * not render them in the transcript.
 */
export interface RemoteCommandFrame {
	kind: "remote_command";
	commandId: string;
	operation: RemoteCommandOperation;
	status: "queued" | "started" | "finished";
	/** The exact ACP prompt needed to recover a queued/started command. */
	prompt?: ContentBlock[];
	/** Stable queue identity; command ids use this as their queue id. */
	queueId?: string;
	/** Original queue insertion timestamp, retained across edit/replay. */
	enqueuedAt?: number;
	outcome?: RemoteCommandOutcome;
}

export type SessionUpdateFrame =
	/** An ACP session/update notification, verbatim. */
	| { kind: "update"; update: SessionUpdate; commandId?: string }
	| RemoteCommandFrame
	| { kind: "permission_requested"; pending: PendingPermission }
	| {
			kind: "permission_resolved";
			requestId: string;
			outcome: RequestPermissionOutcome;
	  }
	/**
	 * The session/prompt request itself failed after the user's message was
	 * journaled — fold marks that message as failed instead of leaving it
	 * looking delivered.
	 */
	| { kind: "prompt_rejected"; reason: string; promptStartSeq: number }
	/** Full state snapshot, emitted whenever session-scoped state changes. */
	| { kind: "state"; state: SessionScopedState }
	/** The requested cursor is unservable — client must resync. */
	| { kind: "reset"; reason: string };

export interface SessionUpdateEnvelope {
	/** Per-session, monotonic from 1, gapless. */
	seq: number;
	/** Journal incarnation; prevents seq reuse after journal loss/recreation. */
	epoch: string;
	sessionId: string;
	ts: number;
	frame: SessionUpdateFrame;
}
