import type {
	AvailableCommand,
	ContentBlock,
	PermissionOption,
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionModeState,
	StopReason,
	ToolCallUpdate,
} from "./acp";

/** Runtime that owns the native session. The public ACP envelope remains
 * stable across native ACP agents and host-side protocol bridges. */
export type HarnessKind =
	| "claude-agent-acp"
	| "codex-app-server"
	| "pi-acp"
	| "myflicker-acp";

export type SessionStatus =
	| "starting"
	| "idle"
	| "running"
	| "awaiting_permission"
	/**
	 * Known from the host's persisted session registry, but no adapter process
	 * is attached (the host restarted since the session was created). Live-path
	 * calls (prompt, getMessages, stream attach) resurrect it on demand via the
	 * adapter's `session/load`.
	 */
	| "offline"
	| "dead";

export interface PendingPermission {
	/** JSON-RPC request id from the adapter — the resolution key. */
	requestId: string;
	/** ACP type, verbatim from the session/request_permission request. */
	toolCall: ToolCallUpdate;
	/** ACP type, verbatim. */
	options: PermissionOption[];
	requestedAt: number;
	/**
	 * True for a multi-select question card (synthetic elicitation): clients
	 * collect any number of non-reject options and answer with
	 * `makeSelectedOutcome`, instead of resolving on the first tap.
	 */
	multiSelect?: boolean;
	/**
	 * True when this card originated from an ACP form elicitation (such as
	 * Claude Code's AskUserQuestion tool), rather than request_permission.
	 */
	isElicitation?: boolean;
}

/**
 * Multi-select answers ride the ACP-reserved `_meta` extension point on a
 * `selected` outcome — the ACP type itself is single-option, and it crosses
 * the wire verbatim (D7), so the extra picks travel as metadata. `optionId`
 * stays the first pick, keeping single-select consumers correct.
 */
const SELECTED_OPTION_IDS_META = "sh.superset/selectedOptionIds";

export function makeSelectedOutcome(
	optionIds: readonly string[],
): RequestPermissionOutcome {
	const [first, ...rest] = optionIds;
	if (first === undefined) {
		throw new Error("makeSelectedOutcome requires at least one optionId");
	}
	if (rest.length === 0) return { outcome: "selected", optionId: first };
	return {
		outcome: "selected",
		optionId: first,
		_meta: { [SELECTED_OPTION_IDS_META]: [...optionIds] },
	};
}

/** Every option id a `selected` outcome carries (single- or multi-select). */
export function selectedOptionIds(outcome: RequestPermissionOutcome): string[] {
	if (outcome.outcome !== "selected") return [];
	const carried = outcome._meta?.[SELECTED_OPTION_IDS_META];
	if (Array.isArray(carried)) {
		const ids = carried.filter((id): id is string => typeof id === "string");
		if (ids.length > 0) return ids;
	}
	return [outcome.optionId];
}

/**
 * A user prompt queued for the current session while another turn is in
 * flight. Host-managed so the queue is uniform across adapters (Codex has no
 * native turnQueue; Claude/Pi do but the host side can't observe or edit
 * them). Not persisted — lost on host restart.
 */
export interface QueuedPrompt {
	/** Host-generated uuid; stable while queued, referenced by editing ops. */
	queueId: string;
	prompt: ContentBlock[];
	enqueuedAt: number;
}

export interface SessionScopedState {
	/** Superset id (uuid) — the adapter's ACP SessionId stays host-internal. */
	sessionId: string;
	/** Stable journal incarnation. A cursor is valid only within this epoch. */
	epoch: string;
	workspaceId: string;
	harness: HarnessKind;
	status: SessionStatus;
	/**
	 * Claude-generated session title (session_info_update). Lives here — not
	 * only in the journaled timeline frame — so it survives resyncs that only
	 * fetch the newest messages page.
	 */
	title: string | null;
	/** ACP modes (incl. plan mode), kept fresh via current_mode_update. */
	currentMode: SessionModeState | null;
	/** Model/effort/mode pickers, kept fresh via config_option_update. */
	configOptions: SessionConfigOption[];
	/** Slash-command catalog; null until the adapter has reported it. */
	availableCommands: AvailableCommand[] | null;
	pendingPermissions: PendingPermission[];
	/** Follow-up prompts waiting to be sent when the current turn finishes. */
	queuedPrompts: QueuedPrompt[];
	cwd: string;
	/** Seq of the latest journaled envelope; subscribe cursor. */
	lastSeq: number;
	lastStopReason: StopReason | null;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
}
