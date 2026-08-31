import type { FoldedTimeline, SessionStatus } from "@superset/session-protocol";
import { useEffect, useMemo, useState } from "react";
import { TimelineTurn } from "./components/TimelineTurn";
import {
	formatElapsedDuration,
	getTurnDuration,
	groupTimelineTurns,
} from "./utils/timelineTurns";

interface Props {
	timeline: FoldedTimeline;
	status?: SessionStatus;
}

function isActiveStatus(status?: SessionStatus): boolean {
	return status === "running" || status === "awaiting_permission";
}

export function TimelineView({ timeline, status }: Props) {
	const turns = useMemo(
		() => groupTimelineTurns(timeline.items),
		[timeline.items],
	);
	const [expandedTurns, setExpandedTurns] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const active = isActiveStatus(status);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, [active]);

	if (turns.length === 0) {
		return (
			<div className="mobile-caption-text mt-16 text-center text-sm">
				Send a message to begin.
			</div>
		);
	}

	return (
		<ol className="flex flex-col gap-3 py-2">
			{turns.map((turn, index) => {
				const durationMs = getTurnDuration(
					turn,
					now,
					active && index === turns.length - 1,
				);
				return (
					<TimelineTurn
						key={turn.id}
						turn={turn}
						duration={
							durationMs === null ? null : formatElapsedDuration(durationMs)
						}
						expanded={expandedTurns.has(turn.id)}
						onToggle={() => {
							setExpandedTurns((current) => {
								const next = new Set(current);
								if (next.has(turn.id)) next.delete(turn.id);
								else next.add(turn.id);
								return next;
							});
						}}
					/>
				);
			})}
		</ol>
	);
}
