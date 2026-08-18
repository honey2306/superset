import { cn } from "@superset/ui/utils";
import type { ActivePaneStatus } from "shared/tabs-types";

// Re-export for consumers
export type { ActivePaneStatus } from "shared/tabs-types";

/** Lookup object for status indicator styling - avoids if/else chains */
const STATUS_CONFIG = {
	permission: {
		pingColor: "bg-info/50",
		dotColor: "bg-info",
		pulse: true,
		tooltip: "Permission needed",
	},
	askuser: {
		pingColor: "bg-accent-2/50",
		dotColor: "bg-accent-2",
		pulse: true,
		tooltip: "Question needs an answer",
	},
	failed: {
		pingColor: "bg-destructive/50",
		dotColor: "bg-destructive",
		pulse: true,
		tooltip: "Agent failed",
	},
	working: {
		pingColor: "bg-warning/50",
		dotColor: "bg-warning",
		pulse: true,
		tooltip: "Agent working",
	},
	review: {
		pingColor: "",
		dotColor: "bg-success",
		pulse: false,
		tooltip: "Ready for review",
	},
} as const satisfies Record<
	ActivePaneStatus,
	{ pingColor: string; dotColor: string; pulse: boolean; tooltip: string }
>;

interface StatusIndicatorProps {
	status: ActivePaneStatus;
	className?: string;
}

/**
 * Visual indicator for pane/workspace status.
 * - Amber pulsing: agent working
 * - Green static: ready for review
 * - Cyan pulsing: tool permission needed
 * - Purple pulsing: AskUser question needs an answer
 * - Red pulsing: agent failed
 */
export function StatusIndicator({ status, className }: StatusIndicatorProps) {
	const config = STATUS_CONFIG[status];

	return (
		<span className={cn("relative flex size-2 shrink-0", className)}>
			{config.pulse && (
				<span
					className={cn(
						"absolute -inset-1 inline-flex animate-ping rounded-full opacity-100",
						config.pingColor,
					)}
				/>
			)}
			<span
				className={cn(
					"relative inline-flex size-2 rounded-full",
					config.dotColor,
				)}
			/>
		</span>
	);
}

/** Get tooltip text for a status - for consumers that wrap with Tooltip */
export function getStatusTooltip(status: ActivePaneStatus): string {
	return STATUS_CONFIG[status].tooltip;
}
