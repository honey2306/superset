import type { ActivePaneStatus } from "shared/tabs-types";

/** 「置顶进行中」组里一行的展示数据（label 计算由 WorkspaceSidebar 完成） */
export interface LiveWorkspaceRowItem {
	workspaceId: string;
	projectId: string;
	label: string;
	/** 多 workspace 项目时补充项目名，用于 title 提示 */
	projectLabel: string | null;
	branch: string;
	status: ActivePaneStatus;
}
