import type { SessionStatus } from "@superset/session-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTurnSettled, type Turn } from "./turns/turns";

/**
 * Per-turn duration tracker.
 *
 * Server timeline items don't yet carry usable timestamps, so this hook
 * observes each turn's arrival in the client:
 *   • startAt  — first render tick where the user message appears.
 *   • endAt    — first render tick where the turn is settled. For the latest
 *                turn, this requires both agent output and an inactive session.
 *
 * Both stamps persist to localStorage keyed by `<sessionId>:<turnId>` so a
 * reload or pane remount keeps the numbers. Only the most recent 200 turns
 * per session are retained.
 *
 * The 1-second ticker only refreshes the returned map when at least one turn
 * is still open (has startAt but no endAt), so completed turns don't cause
 * re-renders.
 */
const STORAGE_PREFIX = "acp-turn-durations:";
const MAX_TURNS_PER_SESSION = 200;

interface TurnStamp {
	/** Turn start (ms since epoch) — first time we see post-user work. */
	s: number;
	/** Turn end (ms) — first time finalAgentMessage lands. Absent = still open. */
	e?: number;
}

function loadSession(sessionId: string): Map<string, TurnStamp> {
	if (typeof window === "undefined") return new Map();
	try {
		const raw = window.localStorage.getItem(STORAGE_PREFIX + sessionId);
		if (!raw) return new Map();
		const parsed = JSON.parse(raw) as { [id: string]: TurnStamp };
		return new Map(Object.entries(parsed));
	} catch {
		return new Map();
	}
}

function saveSession(
	sessionId: string,
	map: Map<string, TurnStamp>,
): Map<string, TurnStamp> {
	if (typeof window === "undefined") return map;
	let out = map;
	try {
		// Cap the number of entries — keep the last N by insertion order.
		if (map.size > MAX_TURNS_PER_SESSION) {
			const entries = Array.from(map.entries());
			out = new Map(entries.slice(-MAX_TURNS_PER_SESSION));
		}
		const obj: { [id: string]: TurnStamp } = {};
		for (const [k, v] of out) obj[k] = v;
		window.localStorage.setItem(
			STORAGE_PREFIX + sessionId,
			JSON.stringify(obj),
		);
	} catch {
		// ignore quota / privacy-mode failures
	}
	return out;
}

/**
 * Returns a Map of turnId → milliseconds elapsed since the turn started.
 * `null` values mean the turn hasn't yet accumulated a start time.
 */
export function useTurnDurations(
	sessionId: string | undefined,
	turns: readonly Turn[],
	status?: SessionStatus,
): Map<string, number> {
	// One in-memory record store per session id.
	const recordsRef = useRef<Map<string, TurnStamp>>(new Map());
	const [tick, setTick] = useState(0);

	// Load on session change.
	useEffect(() => {
		if (!sessionId) {
			recordsRef.current = new Map();
			return;
		}
		recordsRef.current = loadSession(sessionId);
		setTick((n) => n + 1);
	}, [sessionId]);

	// Observe turn state on each render and update the stamp store.
	useEffect(() => {
		if (!sessionId) return;
		const records = recordsRef.current;
		let mutated = false;
		const now = Date.now();
		for (const [index, turn] of turns.entries()) {
			// Synthetic pre-turn groups do not represent a user-initiated run.
			if (
				!turn.preItems.some(
					(item) => item.kind === "message" && item.role === "user",
				)
			) {
				continue;
			}
			let rec = records.get(turn.id);
			if (!rec) {
				rec = { s: now };
				records.set(turn.id, rec);
				mutated = true;
			}
			const settled = isTurnSettled(turn, index === turns.length - 1, status);
			if (rec.e == null && settled) {
				rec.e = now;
				mutated = true;
			} else if (rec.e != null && !settled && index === turns.length - 1) {
				// Repair timestamps written by older clients that treated the first
				// agent message as completion even while the session kept running.
				delete rec.e;
				mutated = true;
			}
		}
		if (mutated) {
			recordsRef.current = saveSession(sessionId, records);
			// Ref writes alone do not re-render completed turns (which have no live
			// ticker), so publish the newly recorded duration immediately.
			setTick((n) => n + 1);
		}
	}, [sessionId, turns, status]);

	// Live tick — only re-render while at least one turn is still open.
	useEffect(() => {
		if (!sessionId) return;
		const hasOpenTurn = () => {
			for (const turn of turns) {
				const rec = recordsRef.current.get(turn.id);
				if (rec && rec.e == null) return true;
			}
			return false;
		};
		if (!hasOpenTurn()) return;
		const id = window.setInterval(() => setTick((n) => n + 1), 1000);
		return () => window.clearInterval(id);
	}, [sessionId, turns]);

	// Build the display map.
	return useMemo(() => {
		// Read the state value so the memo recomputes on each live timer tick.
		void tick;
		const out = new Map<string, number>();
		const records = recordsRef.current;
		const now = Date.now();
		for (const turn of turns) {
			const rec = records.get(turn.id);
			if (!rec) continue;
			const end = rec.e ?? now;
			out.set(turn.id, Math.max(0, end - rec.s));
		}
		return out;
	}, [turns, tick]);
}

/** Format ms → `2m 15s` / `45s` / `1h 5m 20s`. Returns null for <1s. */
export function formatTurnDuration(ms: number): string | null {
	if (!Number.isFinite(ms) || ms < 500) return null;
	const totalSec = Math.round(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}
