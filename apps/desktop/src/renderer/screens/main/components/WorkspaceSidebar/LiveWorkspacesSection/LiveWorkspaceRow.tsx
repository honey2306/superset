import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { BranchTag } from "../WorkspaceListItem/BranchTag";
import { WorkspaceStatusBadge } from "../WorkspaceListItem/WorkspaceStatusBadge";
import type { LiveWorkspaceRowItem } from "./types";
import type { LiveWorkspacePullRequest } from "./useLiveWorkspacePullRequests";

interface LiveWorkspaceRowProps {
	item: LiveWorkspaceRowItem;
	pullRequest?: LiveWorkspacePullRequest;
}

/** 「置顶进行中」组的轻量指向行：点击直达 workspace，交互面全部留在原位置。 */
export function LiveWorkspaceRow({ item, pullRequest }: LiveWorkspaceRowProps) {
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
			title={
				item.projectLabel
					? `${item.projectLabel} · ${item.label}`
					: `${item.label} · ${item.branch}`
			}
			className={cn(
				// 与普通行同一几何与 active 卡片语言
				"relative flex w-full h-8 items-center gap-1.5 pl-2 pr-2 text-[13px]",
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
				<StatusIndicator status={item.status} />
			</span>
			<span
				className={cn(
					"flex-1 min-w-0 truncate text-left text-fg",
					isActive ? "font-semibold" : "font-medium",
				)}
			>
				{item.label}
			</span>
			<BranchTag branch={item.branch} className="max-w-[16ch] shrink-0" />
			{/* PR 只在「进行中」组出现——这里它是重点信息，普通行保持安静 */}
			{pullRequest && (
				<WorkspaceStatusBadge
					state={pullRequest.state}
					prNumber={pullRequest.number}
					prUrl={pullRequest.url}
				/>
			)}
		</button>
	);
}
