import type { PlanItem, TimelineItem } from "@superset/session-protocol";
import { MobileActionSheet } from "../MobileActionSheet";

export function getLatestActivePlan(
	items: readonly TimelineItem[],
): PlanItem | null {
	const latest = items.findLast(
		(item): item is PlanItem => item.kind === "plan" && !item.removed,
	);
	if (!latest) return null;
	return latest.entries.some(
		(entry) => entry.status === "pending" || entry.status === "in_progress",
	)
		? latest
		: null;
}

export function getPlanProgress(plan: PlanItem): {
	completed: number;
	active: number;
	total: number;
	percent: number;
	summary: string;
} {
	const completed = plan.entries.filter(
		(entry) => entry.status === "completed",
	).length;
	const active = plan.entries.filter(
		(entry) => entry.status === "in_progress",
	).length;
	const total = plan.entries.length;
	const summary =
		plan.entries.find((entry) => entry.status === "in_progress")?.content ??
		plan.entries.find((entry) => entry.status === "pending")?.content ??
		"Plan complete";
	return {
		completed,
		active,
		total,
		percent:
			total === 0 ? 0 : Math.round(((completed + active * 0.5) / total) * 100),
		summary,
	};
}

export function MobilePlanDetails({ plan }: { plan: PlanItem }) {
	const progress = getPlanProgress(plan);
	return (
		<div className="mobile-plan-details">
			<div className="mobile-plan-details__progress">
				<span>
					{progress.completed} completed
					{progress.active > 0 ? ` · ${progress.active} in progress` : ""}
				</span>
				<strong>{progress.percent}%</strong>
			</div>
			<div className="mobile-plan-details__bar" aria-hidden="true">
				<span style={{ width: `${progress.percent}%` }} />
			</div>
			<ol className="mobile-plan-details__steps">
				{plan.entries.map((entry, index) => (
					<li key={`${index}:${entry.content}`} data-status={entry.status}>
						<span className="mobile-plan-details__number" aria-hidden="true">
							{entry.status === "completed" ? "✓" : index + 1}
						</span>
						<div>
							<strong>{entry.content}</strong>
							{entry.priority ? <span>{entry.priority} priority</span> : null}
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}

export function MobilePlanPanel({ plan }: { plan: PlanItem }) {
	const progress = getPlanProgress(plan);
	return (
		<MobileActionSheet
			tone="plan"
			icon="✓"
			label="Plan in progress"
			summary={progress.summary}
			meta={`${progress.completed + progress.active}/${progress.total}`}
			kicker="Active plan"
			title="Execution plan"
			subtitle="This plan updates as the agent completes each step."
		>
			<MobilePlanDetails plan={plan} />
		</MobileActionSheet>
	);
}
