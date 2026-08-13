import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function hostBranchPrefixQueryKey(hostUrl: string | null) {
	return ["host-settings", "branch-prefix", hostUrl] as const;
}

export function hostGitInfoQueryKey(hostUrl: string | null) {
	return ["host-settings", "git-info", hostUrl] as const;
}

export function useHostBranchPrefix(hostUrl: string | null) {
	return useQuery({
		queryKey: hostBranchPrefixQueryKey(hostUrl),
		enabled: Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.branchPrefix.get.query();
		},
	});
}

export function useHostGitInfo(hostUrl: string | null) {
	return useQuery({
		queryKey: hostGitInfoQueryKey(hostUrl),
		enabled: Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.branchPrefix.gitInfo.query();
		},
	});
}

export function useSetHostBranchPrefix(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			mode: BranchPrefixMode;
			customPrefix?: string | null;
		}) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.branchPrefix.set.mutate(input);
		},
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: hostBranchPrefixQueryKey(hostUrl),
			}),
	});
}
