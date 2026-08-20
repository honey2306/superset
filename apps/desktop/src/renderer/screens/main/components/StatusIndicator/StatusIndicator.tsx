import { cn } from "@superset/ui/utils";
import type { ActivePaneStatus } from "shared/tabs-types";

// Re-export for consumers
export type { ActivePaneStatus } from "shared/tabs-types";

/** Lookup object for status indicator styling - avoids if/else chains */
const STATUS_CONFIG = {
	permission: {
		dotColor: "bg-info",
		tooltip: "Permission needed",
	},
	askuser: {
		dotColor: "bg-accent-2",
		tooltip: "Question needs an answer",
	},
	failed: {
		dotColor: "bg-destructive",
		tooltip: "Agent failed",
	},
	working: {
		dotColor: "bg-[#f97316]",
		tooltip: "Agent working",
	},
	review: {
		dotColor: "bg-success",
		tooltip: "Ready for review",
	},
} as const satisfies Record<
	ActivePaneStatus,
	{
		dotColor: string;
		tooltip: string;
	}
>;

interface StatusIndicatorProps {
	status: ActivePaneStatus;
	className?: string;
}

/** Visual indicator for pane/workspace status. */
export function StatusIndicator({ status, className }: StatusIndicatorProps) {
	const config = STATUS_CONFIG[status];

	return (
		<span className={cn("relative flex size-2 shrink-0", className)}>
			<span
				className={cn("inline-flex size-2 rounded-full", config.dotColor)}
			/>
		</span>
	);
}

/** Get tooltip text for a status - for consumers that wrap with Tooltip */
export function getStatusTooltip(status: ActivePaneStatus): string {
	return STATUS_CONFIG[status].tooltip;
}
