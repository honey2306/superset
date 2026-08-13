import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

export const hostProjectConfigQueryKey = (
	hostUrl: string | null,
	projectId: string,
) => ["host-project-config", hostUrl, projectId] as const;

export const hostProjectSetupCardQueryKey = (
	hostUrl: string | null,
	projectId: string,
) => ["host-project-setup-card", hostUrl, projectId] as const;

export const hostWorkspaceRunDefinitionQueryKey = (
	hostUrl: string | null,
	projectId: string,
) => ["host-workspace-run-definition", hostUrl, projectId] as const;

export function useHostProjectConfig(projectId: string) {
	const { activeHostUrl } = useLocalHostService();
	return useQuery({
		queryKey: hostProjectConfigQueryKey(activeHostUrl, projectId),
		enabled: Boolean(activeHostUrl && projectId),
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).config.getConfigContent.query({ projectId });
		},
	});
}

export function useHostProjectSetupCard(projectId: string) {
	const { activeHostUrl } = useLocalHostService();
	return useQuery({
		queryKey: hostProjectSetupCardQueryKey(activeHostUrl, projectId),
		enabled: Boolean(activeHostUrl && projectId),
		refetchOnWindowFocus: true,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).config.shouldShowSetupCard.query({ projectId });
		},
	});
}

export function useUpdateHostProjectConfig() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			projectId: string;
			setup?: string[];
			teardown?: string[];
			run?: string[];
		}) => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).config.updateConfig.mutate(input);
		},
		onSuccess: async (_result, input) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: hostProjectConfigQueryKey(activeHostUrl, input.projectId),
				}),
				queryClient.invalidateQueries({
					queryKey: hostProjectSetupCardQueryKey(
						activeHostUrl,
						input.projectId,
					),
				}),
				queryClient.invalidateQueries({
					queryKey: hostWorkspaceRunDefinitionQueryKey(
						activeHostUrl,
						input.projectId,
					),
				}),
			]);
		},
	});
}
