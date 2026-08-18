import { z } from "zod";
import type { ContentBlock, RequestPermissionOutcome } from "./acp";
import type { SessionUpdateEnvelope } from "./envelope";
import type { SessionScopedState } from "./state";
import type { TranscriptTurn, TranscriptTurnSummary } from "./transcript";

// ---------------------------------------------------------------------------
// Cursor encoding for getMessages (journal walked backwards from newest).
// A cursor names the seq BEFORE which the next (older) page starts.
// ---------------------------------------------------------------------------

const CURSOR_PATTERN = /^s([1-9][0-9]*)$/;
const TRANSCRIPT_CURSOR_PATTERN = /^t([1-9][0-9]*)$/;

export function encodeMessagesCursor(beforeSeq: number): string {
	if (!Number.isInteger(beforeSeq) || beforeSeq < 1) {
		throw new Error(`invalid cursor seq: ${beforeSeq}`);
	}
	return `s${beforeSeq}`;
}

export function decodeMessagesCursor(cursor: string): number | null {
	const match = CURSOR_PATTERN.exec(cursor);
	if (!match) return null;
	const seq = Number(match[1]);
	return Number.isSafeInteger(seq) ? seq : null;
}

/** Cursor naming the oldest turn in the next (older) transcript page. */
export function encodeTranscriptCursor(beforeTurn: number): string {
	if (!Number.isInteger(beforeTurn) || beforeTurn < 1) {
		throw new Error(`invalid transcript cursor turn: ${beforeTurn}`);
	}
	return `t${beforeTurn}`;
}

export function decodeTranscriptCursor(cursor: string): number | null {
	const match = TRANSCRIPT_CURSOR_PATTERN.exec(cursor);
	if (!match) return null;
	const turn = Number(match[1]);
	return Number.isSafeInteger(turn) ? turn : null;
}

// ---------------------------------------------------------------------------
// Router input schemas. ACP payloads cross as typed passthrough (D14-b):
// they were already schema-validated by the sdk at the stdio boundary, so we
// check structure lightly and keep the static type authoritative.
// ---------------------------------------------------------------------------

const sessionIdSchema = z.string().min(1);

const limitSchema = z.number().int().min(1).max(200).default(50);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export const contentBlockSchema = z.custom<ContentBlock>(
	(value) => isRecord(value) && typeof value.type === "string",
	"expected an ACP ContentBlock",
);

export const permissionOutcomeSchema = z.custom<RequestPermissionOutcome>(
	(value) =>
		isRecord(value) &&
		(value.outcome === "cancelled" ||
			(value.outcome === "selected" && typeof value.optionId === "string")),
	"expected an ACP RequestPermissionOutcome",
);

export const listSessionsInput = z.object({
	workspaceId: z.string().min(1).optional(),
	// `<createdAt>:<sessionId>` — the previous page's last row (a sort
	// position; see AcpSessionManager.list). Rejecting malformed cursors here
	// keeps list consistent with getMessages (BAD_REQUEST, not an empty page).
	cursor: z
		.string()
		.regex(/^\d+:.+$/, "expected a <createdAt>:<sessionId> list cursor")
		.refine((cursor) => {
			const separator = cursor.indexOf(":");
			return Number.isSafeInteger(Number(cursor.slice(0, separator)));
		}, "expected a safe-integer createdAt in the list cursor")
		.optional(),
	limit: limitSchema,
});

export const createSessionInput = z.object({
	sessionId: sessionIdSchema,
	workspaceId: z.string().min(1),
	/** Omitted deliberately remains Claude, preserving the existing shell. */
	harness: z
		.enum(["claude-agent-acp", "codex-app-server", "pi-acp", "myflicker-acp"])
		.optional(),
	/**
	 * Client-preferred model id. Applied after `session/new` via
	 * `session/set_config_option` when the adapter exposes a `model` select
	 * config option; silently ignored when the harness has no such option or
	 * the id is not in its catalog (adapter-side validation wins).
	 */
	model: z.string().min(1).optional(),
});

export const getSessionInput = z.object({
	sessionId: sessionIdSchema,
});

export const getMessagesInput = z.object({
	sessionId: sessionIdSchema,
	cursor: z.string().optional(),
	limit: limitSchema,
});

const transcriptLimitSchema = z.number().int().min(1).max(50).default(8);

export const getTranscriptInput = z.object({
	sessionId: sessionIdSchema,
	cursor: z
		.string()
		.regex(TRANSCRIPT_CURSOR_PATTERN, "expected a transcript turn cursor")
		.optional(),
	/** Return a page containing this 1-based turn, used by the rail. */
	targetTurn: z.number().int().min(1).optional(),
	limit: transcriptLimitSchema,
});

export const promptInput = z.object({
	sessionId: sessionIdSchema,
	/** Optional client-generated id: retrying it must not start a second turn. */
	commandId: z.string().min(1).max(128).optional(),
	prompt: z.array(contentBlockSchema).min(1),
});

export const respondToPermissionInput = z.object({
	sessionId: sessionIdSchema,
	requestId: z.string().min(1),
	outcome: permissionOutcomeSchema,
});

export const cancelInput = z.object({
	sessionId: sessionIdSchema,
});

/** Permanently closes an ACP session and removes its recoverable history. */
export const closeSessionInput = z.object({
	sessionId: sessionIdSchema,
});

export const setModeInput = z.object({
	sessionId: sessionIdSchema,
	modeId: z.string().min(1),
});

export const setConfigOptionInput = z.object({
	sessionId: sessionIdSchema,
	configId: z.string().min(1),
	value: z.union([z.string(), z.boolean()]),
});

const queueIdSchema = z.string().min(1);

export const enqueuePromptInput = z.object({
	sessionId: sessionIdSchema,
	commandId: z.string().min(1).max(128).optional(),
	prompt: z.array(contentBlockSchema).min(1),
});

export const sendNowInput = enqueuePromptInput;

export const removeQueuedPromptInput = z.object({
	sessionId: sessionIdSchema,
	queueId: queueIdSchema,
});

export const reorderQueueInput = z.object({
	sessionId: sessionIdSchema,
	orderedIds: z.array(queueIdSchema).min(1),
});

export const editQueuedPromptInput = z.object({
	sessionId: sessionIdSchema,
	queueId: queueIdSchema,
	prompt: z.array(contentBlockSchema).min(1),
});

export const clearQueueInput = z.object({
	sessionId: sessionIdSchema,
});

// ---------------------------------------------------------------------------
// The client-side contract the React hooks consume. Structural on purpose:
// any transport that can answer these (a tRPC client, a test stub) fits.
// ---------------------------------------------------------------------------

export type RespondToPermissionResult =
	| { status: "resolved" }
	| { status: "already_resolved" };

/**
 * prompt acks admission, not completion: a turn can run for minutes-to-hours
 * (it blocks on human permission decisions), far beyond what a buffered
 * relay HTTP request survives. Turn completion — stop reason, errors — is
 * observed on the update stream's `state` frames.
 */
export interface PromptAccepted {
	accepted: true;
}

export interface MessagesPage {
	items: SessionUpdateEnvelope[];
	nextCursor: string | null;
}

export interface TranscriptPage {
	/** Complete semantic turns in chronological order. */
	turns: TranscriptTurn[];
	/** Lightweight index for the entire retained transcript. */
	index: TranscriptTurnSummary[];
	totalTurns: number;
	/** Cursor for the next page of older turns. */
	nextCursor: string | null;
}

/**
 * `enabled` doubles as the capability signal: `list` is the one ungated ACP
 * procedure, so a host with the feature off answers `{ items: [], enabled:
 * false }` instead of erroring. Clients already call `list` to render the
 * sessions screen, so feature detection costs zero extra requests.
 */
export interface SessionsPage {
	items: SessionScopedState[];
	nextCursor: string | null;
	enabled: boolean;
}

export interface EnqueuePromptResult {
	queueId: string;
}

export interface AcpSessionsApi {
	get(input: { sessionId: string }): Promise<SessionScopedState>;
	getMessages(input: {
		sessionId: string;
		cursor?: string;
		limit?: number;
	}): Promise<MessagesPage>;
	/** Semantic history; optional while older hosts/fixtures only support raw pages. */
	getTranscript?(input: {
		sessionId: string;
		cursor?: string;
		targetTurn?: number;
		limit?: number;
	}): Promise<TranscriptPage>;
	prompt(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): Promise<PromptAccepted>;
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}): Promise<RespondToPermissionResult>;
	cancel(input: { sessionId: string }): Promise<void>;
	close(input: { sessionId: string }): Promise<void>;
	setMode(input: { sessionId: string; modeId: string }): Promise<void>;
	setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void>;

	// ── Follow-up queue (host-managed) ───────────────────────────────────
	/**
	 * Queue a prompt to run after the current turn (and any prior queued
	 * prompts) finishes. If no turn is in flight and the queue is empty,
	 * host may drain it immediately.
	 */
	enqueuePrompt(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): Promise<EnqueuePromptResult>;
	/**
	 * Cancel the current turn and immediately run this prompt. Works for
	 * every adapter — host does `cancel + drain` atomically so no other
	 * queued prompt races in front. If the session is idle, behaves as
	 * `prompt`.
	 */
	sendNow(input: {
		sessionId: string;
		commandId?: string;
		prompt: ContentBlock[];
	}): Promise<PromptAccepted>;
	removeQueuedPrompt(input: {
		sessionId: string;
		queueId: string;
	}): Promise<void>;
	/**
	 * Full reorder — the payload lists every queued id in the intended new
	 * order. Host rejects on length mismatch or unknown / duplicate ids.
	 */
	reorderQueue(input: {
		sessionId: string;
		orderedIds: string[];
	}): Promise<void>;
	editQueuedPrompt(input: {
		sessionId: string;
		queueId: string;
		prompt: ContentBlock[];
	}): Promise<void>;
	clearQueue(input: { sessionId: string }): Promise<void>;
}
