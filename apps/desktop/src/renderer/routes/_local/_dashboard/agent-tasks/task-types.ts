import type { HostServiceClient } from "renderer/lib/host-service-client";
export type TaskDetailData = Awaited<
	ReturnType<HostServiceClient["tasks"]["get"]["query"]>
>;
export type TaskListData = Awaited<
	ReturnType<HostServiceClient["tasks"]["list"]["query"]>
>;
export type ManagedRun = NonNullable<TaskDetailData["run"]>;
export const managedTaskKeys = {
	all: (url: string | null) => ["managed-tasks", url] as const,
	list: (url: string | null) => ["managed-tasks", url, "list"] as const,
	detail: (url: string, id: string) =>
		["managed-tasks", url, "detail", id] as const,
};
