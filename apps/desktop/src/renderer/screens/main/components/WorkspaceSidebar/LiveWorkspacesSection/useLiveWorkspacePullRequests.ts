import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

export interface LiveWorkspacePullRequest {
	url: string;
	number: number;
	state: "open" | "draft" | "merged" | "closed";
}

/**
 * 一次批量取「进行中」组这几个 workspace 的 PR。普通行按设计稿不渲染 PR，
 * 所以这里不复用逐行缓存，而是用 live 集合当 key 发一次请求。
 */
export function useLiveWorkspacePullRequests(
	workspaceIds: string[],
): Map<string, LiveWorkspacePullRequest> {
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const idsKey = useMemo(
		() => [...workspaceIds].sort().join(","),
		[workspaceIds],
	);

	const { data } = useQuery({
		queryKey: ["host-service", "pull-requests", "live-batch", hostUrl, idsKey],
		enabled: Boolean(hostUrl) && idsKey.length > 0,
		staleTime: 60_000,
		queryFn: () => {
			if (!hostUrl || !idsKey) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.getByWorkspaces.query({ workspaceIds: idsKey.split(",") });
		},
	});

	return useMemo(() => {
		const byWorkspace = new Map<string, LiveWorkspacePullRequest>();
		for (const snapshot of data?.workspaces ?? []) {
			const pullRequest = snapshot.isPullRequestSuppressed
				? null
				: snapshot.pullRequest;
			if (!pullRequest) continue;
			byWorkspace.set(snapshot.workspaceId, {
				url: pullRequest.url,
				number: pullRequest.number,
				state: pullRequest.state === "queued" ? "open" : pullRequest.state,
			});
		}
		return byWorkspace;
	}, [data]);
}
