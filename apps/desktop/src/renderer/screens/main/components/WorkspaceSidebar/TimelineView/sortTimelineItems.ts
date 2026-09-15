import type { ActivePaneStatus } from "shared/tabs-types";

export interface TimelineItem {
	workspaceId: string;
	projectId: string;
	/** workspace 名（单 workspace 项目时就是项目名） */
	label: string;
	/** 所属项目名——平铺之后没有项目层级，得由行自己交代 */
	projectName: string;
	branch: string;
	status: ActivePaneStatus | null;
	lastActivityAt: number | null;
	/** 有 agent 正在跑或等人介入 */
	isLive: boolean;
}

/**
 * 时间线排序：正在进行的排最前（它们此刻就在活动），其余按最后活动时间倒序，
 * 从没跑过 agent 的垫在最后并按名字稳定排列。
 */
export function sortTimelineItems(items: TimelineItem[]): TimelineItem[] {
	return [...items].sort((a, b) => {
		if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;

		const aAt = a.lastActivityAt;
		const bAt = b.lastActivityAt;
		if (aAt !== null && bAt !== null && aAt !== bAt) return bAt - aAt;
		if (aAt !== null && bAt === null) return -1;
		if (aAt === null && bAt !== null) return 1;

		return a.label.localeCompare(b.label);
	});
}
