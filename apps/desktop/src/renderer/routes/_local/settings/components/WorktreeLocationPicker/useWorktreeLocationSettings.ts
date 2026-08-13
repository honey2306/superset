import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function worktreeLocationQueryKey(hostUrl: string | null) {
	return ["host-settings", "worktree-location", hostUrl] as const;
}

export function useWorktreeLocationSettings(
	hostUrl: string | null,
	opts?: { enabled?: boolean },
) {
	return useQuery({
		queryKey: worktreeLocationQueryKey(hostUrl),
		enabled: Boolean(hostUrl) && (opts?.enabled ?? true),
		queryFn: async () => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.worktreeLocation.get.query();
		},
	});
}

export function useSetWorktreeBaseDir(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (path: string | null) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.worktreeLocation.set.mutate({ path });
		},
		onSuccess: (data, path) => {
			queryClient.setQueryData(worktreeLocationQueryKey(hostUrl), data);
			toast.success(
				path ? "Worktree location updated" : "Worktree location reset",
			);
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : String(err));
		},
	});
}
