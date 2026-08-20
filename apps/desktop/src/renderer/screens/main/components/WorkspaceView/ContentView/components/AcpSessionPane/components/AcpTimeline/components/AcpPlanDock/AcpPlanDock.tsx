import type { PlanItem } from "@superset/session-protocol";
import { ChevronDown, ListChecks } from "lucide-react";
import { useState } from "react";
import { AcpPlanItem } from "../AcpPlanItem";

interface AcpPlanDockProps {
	item: PlanItem;
	review?: {
		isSubmitting: boolean;
		onApprove(feedback?: string): Promise<void>;
		onRequestChanges(feedback: string): Promise<void>;
	};
}

function getPlanSummary(item: PlanItem): string {
	return (
		item.entries.find((entry) => entry.status === "in_progress")?.content ??
		item.entries.find((entry) => entry.status === "pending")?.content ??
		"Plan complete"
	);
}

export function AcpPlanDock({ item, review }: AcpPlanDockProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const done = item.entries.filter(
		(entry) => entry.status === "completed",
	).length;
	const inProgress = item.entries.filter(
		(entry) => entry.status === "in_progress",
	).length;
	const total = item.entries.length;

	return (
		<div className="acp-plan-dock">
			{isExpanded && (
				<div className="acp-plan-dock__popover">
					<AcpPlanItem item={item} review={review} />
				</div>
			)}
			<button
				type="button"
				className="acp-plan-dock__trigger"
				aria-expanded={isExpanded}
				aria-label={isExpanded ? "Collapse plan" : "Expand plan"}
				onClick={() => setIsExpanded((expanded) => !expanded)}
			>
				<ListChecks className="acp-plan-dock__icon" aria-hidden />
				<span
					className="acp-plan-dock__progress"
					title={`${done} completed, ${inProgress} in progress, ${total - done - inProgress} pending`}
				>
					{done + inProgress}/{total}
				</span>
				<span className="acp-plan-dock__summary">{getPlanSummary(item)}</span>
				<ChevronDown className="acp-plan-dock__chevron" aria-hidden />
			</button>
		</div>
	);
}
