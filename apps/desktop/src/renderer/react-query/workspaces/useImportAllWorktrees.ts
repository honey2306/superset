import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorkspaceCreationBranchesQueryKey } from "renderer/hooks/host-workspaces/useWorkspaceCreationBranches";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceProvisioningSubmission } from "renderer/stores/workspace-launch";

export function useImportAllWorktrees() {
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const { submit } = useWorkspaceProvisioningSubmission();

	return useMutation({
		mutationFn: async ({ projectId }: { projectId: string }) => {
			if (!machineId || !activeHostUrl) {
				throw new Error("No active host");
			}

			const worktreeResult = await getHostServiceClientByUrl(
				activeHostUrl,
			).workspaceCreation.searchBranches.query({
				projectId,
				filter: "worktree",
				limit: 200,
				refresh: true,
			});
			const candidates = worktreeResult.items.filter(
				(worktree): worktree is typeof worktree & { worktreePath: string } =>
					worktree.worktreePath !== null && !worktree.hasWorkspace,
			);
			const outcomes = await Promise.all(
				candidates.map(
					(worktree) =>
						submit({
							hostId: machineId,
							snapshot: {
								id: crypto.randomUUID(),
								projectId,
								name: worktree.name,
								branch: worktree.name,
								worktreePath: worktree.worktreePath,
							},
						}).completed,
				),
			);
			const failed = outcomes.find((outcome) => !outcome.ok);
			if (failed && !failed.ok) {
				throw new Error(failed.error);
			}
			return { imported: outcomes.length };
		},
		onSuccess: async (_data, variables) => {
			await queryClient.invalidateQueries({
				queryKey: getWorkspaceCreationBranchesQueryKey({
					projectId: variables.projectId,
					hostUrl: activeHostUrl,
					filter: "worktree",
					query: "",
				}),
			});
		},
	});
}
