import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { BranchTag } from "../WorkspaceListItem/BranchTag";
import type { TimelineItem } from "./sortTimelineItems";

interface TimelineRowProps {
	item: TimelineItem;
	now: Date;
}

export function TimelineRow({ item, now }: TimelineRowProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const isActive = !!matchRoute({
		to: "/workspace/$workspaceId",
		params: { workspaceId: item.workspaceId },
		fuzzy: true,
	});

	return (
		<button
			type="button"
			onClick={() => navigateToWorkspace(item.workspaceId, navigate)}
			title={`${item.projectName} · ${item.label} · ${item.branch}`}
			className={cn(
				// 与项目视图同一套行语言：双行、32+8 高、当前行浮起成卡片
				"relative flex w-full h-10 items-center gap-1.5 pl-2 pr-2 text-[13px]",
				"transition-colors duration-[120ms] text-left cursor-pointer rounded-ds-3",
				isActive
					? "bg-surface-elev ring-1 ring-inset ring-line-strong shadow-ds-1 hover:bg-surface-elev"
					: "hover:bg-hover",
			)}
		>
			{isActive && (
				<span className="absolute left-0 top-[5px] bottom-[5px] w-[2px] rounded-r-sm bg-accent-solid" />
			)}
			<span className="flex w-[14px] shrink-0 justify-center">
				{item.status && <StatusIndicator status={item.status} />}
			</span>

			<div className="flex-1 min-w-0 flex flex-col justify-center gap-px">
				<div className="flex items-center gap-1.5 min-w-0">
					<span
						className={cn(
							"truncate min-w-0 leading-[1.3] text-fg",
							isActive ? "font-semibold" : "font-medium",
						)}
					>
						{item.label}
					</span>
					{/* 平铺之后项目名是行自己的责任；单 workspace 项目的名字
					    本身就是项目名，再标一遍是重复 */}
					{item.projectName !== item.label && (
						<span className="shrink-0 truncate max-w-[8ch] text-[10px] text-fg-faint">
							{item.projectName}
						</span>
					)}
					{item.lastActivityAt !== null && (
						<span className="ml-auto shrink-0 font-mono text-[10px] text-fg-faint tabular-nums">
							{formatDistanceStrict(new Date(item.lastActivityAt), now)}
						</span>
					)}
				</div>
				<BranchTag branch={item.branch} />
			</div>
		</button>
	);
}
