import type { SessionStatus } from "@superset/session-protocol";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { invokeJumpHandler } from "../../paneJumpRegistry";

interface AcpPaneToolbarProps {
	/**
	 * Session metadata mirrored into `pane.data.acp` (kept in sync by
	 * `onSessionMetadataChange`). Rendering the toolbar from pane data — not
	 * from the live `useAcpSession` — avoids re-mounting on every stream tick.
	 */
	title: string | null | undefined;
	agentLabel: string;
	/** Session status — drives the run-time counter. Only "running" accumulates. */
	status?: SessionStatus | null;
	/**
	 * Session id — used to look up the jump-to-last-user-message handler
	 * registered by `AcpSessionPane`. Clicking anywhere on the toolbar body
	 * (except pane actions) triggers the same behaviour as the ↑ button in
	 * the composer.
	 */
	sessionId?: string;
	/** The pane system's own actions (split, close, ...) — placed on the right. */
	paneActions: ReactNode;
}

function formatElapsed(sec: number): string {
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

/**
 * The persisted timer keeps the accumulated portion separate from an active
 * run. Keeping the anchor in storage is important because a pane can be
 * unmounted while the ACP session continues running.
 *
 * `lastObservedAt` is the last time a mounted toolbar observed the running
 * session. If a pane is reopened after the session stopped while no toolbar
 * was mounted, it lets us finalize only the time we know was active instead
 * of counting the whole detached interval.
 */
export interface StoredElapsedState {
	accumulatedMs: number;
	runningSince: number | null;
	lastObservedAt: number | null;
}

export const ELAPSED_STORAGE_PREFIX = "acp-toolbar-elapsed-ms:";

const EMPTY_ELAPSED_STATE: StoredElapsedState = {
	accumulatedMs: 0,
	runningSince: null,
	lastObservedAt: null,
};

function asNonNegativeFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

/** Parse both the current object format and the original numeric format. */
export function parseStoredElapsedState(
	raw: string | null,
): StoredElapsedState {
	if (!raw) return { ...EMPTY_ELAPSED_STATE };

	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "number") {
			return {
				...EMPTY_ELAPSED_STATE,
				accumulatedMs: asNonNegativeFiniteNumber(parsed) ?? 0,
			};
		}
		if (!parsed || typeof parsed !== "object") {
			return { ...EMPTY_ELAPSED_STATE };
		}

		const value = parsed as {
			accumulatedMs?: unknown;
			runningSince?: unknown;
			lastObservedAt?: unknown;
		};
		const runningSince = asNonNegativeFiniteNumber(value.runningSince);
		const lastObservedAt = asNonNegativeFiniteNumber(value.lastObservedAt);
		return {
			accumulatedMs: asNonNegativeFiniteNumber(value.accumulatedMs) ?? 0,
			runningSince,
			// Older object-shaped values may not have this field. Falling back to
			// the anchor keeps them safe to resume while still allowing a later
			// non-running mount to finalize them.
			lastObservedAt: lastObservedAt ?? runningSince,
		};
	} catch {
		return { ...EMPTY_ELAPSED_STATE };
	}
}

export function serializeStoredElapsedState(state: StoredElapsedState): string {
	return JSON.stringify({
		accumulatedMs: Math.floor(Math.max(0, state.accumulatedMs)),
		runningSince:
			state.runningSince == null
				? null
				: Math.floor(Math.max(0, state.runningSince)),
		lastObservedAt:
			state.lastObservedAt == null
				? null
				: Math.floor(Math.max(0, state.lastObservedAt)),
	});
}

export function elapsedMsAt(state: StoredElapsedState, now: number): number {
	const activeMs =
		state.runningSince == null ? 0 : Math.max(0, now - state.runningSince);
	return Math.max(0, state.accumulatedMs) + activeMs;
}

export function startOrResumeElapsed(
	state: StoredElapsedState,
	now: number,
): StoredElapsedState {
	return {
		...state,
		runningSince: state.runningSince ?? now,
		lastObservedAt: Math.max(state.lastObservedAt ?? 0, now),
	};
}

export function finalizeElapsed(
	state: StoredElapsedState,
	now: number,
	capAtLastObserved = false,
): StoredElapsedState {
	if (state.runningSince == null) {
		return { ...state, lastObservedAt: now };
	}

	const end = capAtLastObserved
		? Math.min(now, Math.max(state.runningSince, state.lastObservedAt ?? now))
		: now;
	return {
		accumulatedMs: state.accumulatedMs + Math.max(0, end - state.runningSince),
		runningSince: null,
		lastObservedAt: now,
	};
}

/**
 * Merge a candidate with the state currently in localStorage. Every write
 * rereads first, so a second mounted toolbar cannot replace a newer total
 * with its stale in-memory copy.
 */
export function mergeStoredElapsedState(
	current: StoredElapsedState,
	candidate: StoredElapsedState,
): StoredElapsedState {
	const currentObservedAt =
		current.lastObservedAt ?? current.runningSince ?? -Infinity;
	const candidateObservedAt =
		candidate.lastObservedAt ?? candidate.runningSince ?? -Infinity;
	if (candidateObservedAt < currentObservedAt) return current;

	return {
		...candidate,
		accumulatedMs: Math.max(current.accumulatedMs, candidate.accumulatedMs),
	};
}

function loadStoredElapsedState(
	sessionId: string | undefined,
): StoredElapsedState {
	if (!sessionId || typeof window === "undefined") {
		return { ...EMPTY_ELAPSED_STATE };
	}
	try {
		return parseStoredElapsedState(
			window.localStorage.getItem(ELAPSED_STORAGE_PREFIX + sessionId),
		);
	} catch {
		return { ...EMPTY_ELAPSED_STATE };
	}
}

function saveStoredElapsedState(
	sessionId: string | undefined,
	candidate: StoredElapsedState,
): StoredElapsedState {
	if (!sessionId || typeof window === "undefined") return candidate;
	try {
		const current = loadStoredElapsedState(sessionId);
		const merged = mergeStoredElapsedState(current, candidate);
		window.localStorage.setItem(
			ELAPSED_STORAGE_PREFIX + sessionId,
			serializeStoredElapsedState(merged),
		);
		return merged;
	} catch {
		// Ignore quota / privacy-mode failures while keeping the in-memory timer.
		return candidate;
	}
}

function useRunElapsed(
	sessionId: string | undefined,
	status: AcpPaneToolbarProps["status"],
): number | null {
	const [elapsed, setElapsed] = useState(() => {
		const state = loadStoredElapsedState(sessionId);
		return Math.floor(elapsedMsAt(state, Date.now()) / 1000);
	});
	const stateRef = useRef(loadStoredElapsedState(sessionId));
	const previousSessionIdRef = useRef(sessionId);
	const previousRunningRef = useRef<boolean | null>(null);
	const isRunning = status === "running";

	useEffect(() => {
		const sessionChanged = previousSessionIdRef.current !== sessionId;
		if (sessionChanged) {
			previousSessionIdRef.current = sessionId;
			previousRunningRef.current = null;
			stateRef.current = loadStoredElapsedState(sessionId);
			setElapsed(Math.floor(elapsedMsAt(stateRef.current, Date.now()) / 1000));
		}

		if (!sessionId) {
			previousRunningRef.current = isRunning;
			return;
		}

		const now = Date.now();
		const latest = loadStoredElapsedState(sessionId);
		const next = isRunning
			? startOrResumeElapsed(latest, now)
			: latest.runningSince == null
				? latest
				: finalizeElapsed(
						latest,
						now,
						previousRunningRef.current !== true || sessionChanged,
					);
		const saved =
			isRunning || latest.runningSince != null
				? saveStoredElapsedState(sessionId, next)
				: next;
		stateRef.current = saved;
		setElapsed(Math.floor(elapsedMsAt(saved, now) / 1000));
		previousRunningRef.current = isRunning;
	}, [isRunning, sessionId]);

	useEffect(() => {
		if (!sessionId || !isRunning) return undefined;

		const tick = () => {
			const now = Date.now();
			const latest = loadStoredElapsedState(sessionId);
			const saved = saveStoredElapsedState(
				sessionId,
				startOrResumeElapsed(latest, now),
			);
			stateRef.current = saved;
			setElapsed(Math.floor(elapsedMsAt(saved, now) / 1000));
		};

		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [isRunning, sessionId]);

	// Show the elapsed counter once the session has any accumulated time
	// (persisted or in-flight) or is currently running. Brand-new sessions
	// that have never entered `running` stay hidden until first activity.
	if (!sessionId) return null;
	if (elapsed <= 0 && !isRunning) return null;
	return elapsed;
}

export function AcpPaneToolbar({
	title,
	agentLabel,
	status,
	sessionId,
	paneActions,
}: AcpPaneToolbarProps) {
	const elapsed = useRunElapsed(sessionId, status);
	const jumpEnabled = sessionId != null;
	const handleJump = useCallback(() => {
		if (!sessionId) return;
		invokeJumpHandler(sessionId);
	}, [sessionId]);

	return (
		<div className="acp-pane__toolbar">
			{/* Clickable body — activates the same jump as composer ↑ button */}
			<button
				type="button"
				className="acp-pane__toolbar-hit no-drag"
				disabled={!jumpEnabled}
				aria-label={jumpEnabled ? "Jump to my last message" : undefined}
				title={jumpEnabled ? "Jump to my last message" : undefined}
				onMouseDown={(event) => event.stopPropagation()}
				onDragStart={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
				onClick={handleJump}
			>
				<span className="acp-pane__chip">
					<span>{agentLabel}</span>
				</span>

				{title && (
					<span
						className="acp-pane__toolbar-title select-text cursor-text"
						title={title}
					>
						{title}
					</span>
				)}

				<span className="acp-pane__toolbar-spacer" />

				{elapsed != null && (
					<span
						className="acp-pane__toolbar-elapsed"
						title={
							status === "running"
								? "Elapsed run time"
								: "Elapsed run time (paused)"
						}
						data-paused={status !== "running" ? "true" : undefined}
					>
						用时 {formatElapsed(elapsed)}
					</span>
				)}
			</button>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag-to-split from triggering on pane action buttons */}
			<div
				className="acp-pane__toolbar-actions"
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				{paneActions}
			</div>
		</div>
	);
}
