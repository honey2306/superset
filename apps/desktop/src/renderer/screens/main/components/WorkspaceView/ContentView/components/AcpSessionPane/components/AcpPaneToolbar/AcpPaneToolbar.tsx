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
 * Accumulates elapsed time while `status === "running"`. Pauses when the
 * agent is awaiting a response, dead, or idle; resumes when it goes running
 * again. Time is kept in seconds and only re-renders at 1Hz.
 */
const ELAPSED_STORAGE_PREFIX = "acp-toolbar-elapsed-ms:";

function loadStoredElapsedMs(sessionId: string | undefined): number {
	if (!sessionId || typeof window === "undefined") return 0;
	try {
		const raw = window.localStorage.getItem(ELAPSED_STORAGE_PREFIX + sessionId);
		if (!raw) return 0;
		const n = Number(raw);
		return Number.isFinite(n) && n >= 0 ? n : 0;
	} catch {
		return 0;
	}
}

function saveStoredElapsedMs(sessionId: string | undefined, ms: number): void {
	if (!sessionId || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			ELAPSED_STORAGE_PREFIX + sessionId,
			String(Math.floor(ms)),
		);
	} catch {
		// ignore quota / privacy-mode failures
	}
}

/**
 * Accumulates elapsed time while `status === "running"`. Pauses when the
 * agent is awaiting a response, dead, or idle; resumes when it goes running
 * again. Persisted to localStorage keyed by sessionId so app restarts (and
 * pane remounts) keep the running total.
 */
function useRunElapsed(
	sessionId: string | undefined,
	status: AcpPaneToolbarProps["status"],
): number | null {
	// Seed from persisted total so the display shows up immediately on mount.
	const [elapsed, setElapsed] = useState(() =>
		Math.floor(loadStoredElapsedMs(sessionId) / 1000),
	);
	const accumulatedRef = useRef(loadStoredElapsedMs(sessionId));
	const runStartRef = useRef<number | null>(null);
	const isRunning = status === "running";

	// If the session id changes (tab reused, unlikely), reseed from storage.
	useEffect(() => {
		accumulatedRef.current = loadStoredElapsedMs(sessionId);
		runStartRef.current = null;
		setElapsed(Math.floor(accumulatedRef.current / 1000));
	}, [sessionId]);

	useEffect(() => {
		if (isRunning) {
			runStartRef.current = Date.now();
			const tick = () => {
				const now = Date.now();
				const started = runStartRef.current ?? now;
				const totalMs = accumulatedRef.current + (now - started);
				setElapsed(Math.floor(totalMs / 1000));
				saveStoredElapsedMs(sessionId, totalMs);
			};
			tick();
			const id = setInterval(tick, 1000);
			return () => {
				clearInterval(id);
				if (runStartRef.current != null) {
					accumulatedRef.current += Date.now() - runStartRef.current;
					runStartRef.current = null;
					saveStoredElapsedMs(sessionId, accumulatedRef.current);
				}
			};
		}
		// Not running — freeze display at whatever we had accumulated.
		if (runStartRef.current != null) {
			accumulatedRef.current += Date.now() - runStartRef.current;
			runStartRef.current = null;
			saveStoredElapsedMs(sessionId, accumulatedRef.current);
			setElapsed(Math.floor(accumulatedRef.current / 1000));
		}
		return undefined;
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
