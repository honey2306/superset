import type { PlanItem } from "@superset/session-protocol";

interface AcpPlanItemProps {
	item: PlanItem;
}

export function AcpPlanItem({ item }: AcpPlanItemProps) {
	const done = item.entries.filter((e) => e.status === "completed").length;
	const inProgress = item.entries.filter(
		(e) => e.status === "in_progress",
	).length;
	const total = item.entries.length;

	return (
		<div className="acp-plan" data-removed={item.removed ? "true" : undefined}>
			<div className="acp-plan__head">
				<span aria-hidden>◫</span>
				<span>Plan{item.removed ? " (removed)" : ""}</span>
				<span className="acp-plan__head-progress">
					{done + inProgress} / {total}
					{inProgress > 0 && " in progress"}
				</span>
			</div>
			<ol className="acp-plan__items">
				{item.entries.map((entry, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: plan entries have no stable id
						key={`e-${i}`}
						className="acp-plan__item"
						data-status={entry.status}
					>
						<span className="acp-plan__box" aria-hidden>
							{entry.status === "completed" ? (
								"✓"
							) : entry.status === "in_progress" ? (
								<span className="acp-plan__spinner" />
							) : (
								""
							)}
						</span>
						<span className="acp-plan__text">{entry.content}</span>
						{entry.priority && (
							<span className="acp-plan__priority" data-level={entry.priority}>
								{entry.priority}
							</span>
						)}
					</li>
				))}
			</ol>
		</div>
	);
}
