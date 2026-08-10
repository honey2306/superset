import type { SelectAutomationRun } from "@superset/db/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { formatDistanceStrict } from "date-fns";
import { useNow } from "renderer/hooks/useNow";
import {
	HOST_OFFLINE_HELP,
	isHostOfflineError,
} from "../../../utils/hostOfflineError";

const STATUS_DOT: Record<SelectAutomationRun["status"], string> = {
	dispatched: "bg-success-tint",
	dispatching: "bg-warning",
	skipped_offline: "bg-destructive",
	dispatch_failed: "bg-destructive",
};

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	return `${formatDistanceStrict(date, now)} ago`;
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	const now = useNow();

	if (runs.length === 0) {
		return <p className="text-sm italic text-fg-mute">No runs yet</p>;
	}

	return (
		<ul className="flex flex-col gap-0.5 text-sm">
			{runs.map((run) => {
				const row = (
					<button
						type="button"
						disabled
						onClick={() => {}}
						className={cn(
							"flex w-full items-center gap-2 rounded-ds-3 px-2 py-1.5 text-left",
							"cursor-default opacity-70",
						)}
					>
						<span
							role="img"
							aria-label={run.status}
							className={cn(
								"inline-block size-2 shrink-0 rounded-full",
								STATUS_DOT[run.status],
							)}
						/>
						<span className="truncate">{run.title || "Automation"}</span>
						<span className="ml-auto shrink-0 truncate text-fg-mute">
							{run.scheduledFor
								? formatAgo(new Date(run.scheduledFor), now)
								: "—"}
						</span>
					</button>
				);
				return (
					<li key={run.id}>
						{run.error ? (
							<Tooltip>
								<TooltipTrigger asChild>{row}</TooltipTrigger>
								<TooltipContent
									side="left"
									className="max-w-xs whitespace-pre-wrap"
								>
									{isHostOfflineError(run.error)
										? `${run.error}. ${HOST_OFFLINE_HELP}`
										: run.error}
								</TooltipContent>
							</Tooltip>
						) : (
							row
						)}
					</li>
				);
			})}
		</ul>
	);
}
