import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";

interface UpdateProjectInput {
	id: string;
	patch: {
		name?: string;
		color?: string;
		hideImage?: boolean;
	};
}

/**
 * Updates host-owned project metadata and desktop-local presentation state.
 * Project names belong to the Host project API; color/image preferences stay
 * in Local Product State because they are renderer presentation choices.
 */
export function useUpdateProject(
	options?: UseMutationOptions<void, Error, UpdateProjectInput>,
) {
	const { activeHostUrl } = useLocalHostService();
	const collections = useLocalCollections();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	return useMutation({
		...options,
		mutationFn: async ({ id, patch }) => {
			if (patch.name !== undefined) {
				if (!activeHostUrl)
					throw new Error("Local host service is unavailable");
				await getHostServiceClientByUrl(activeHostUrl).project.update.mutate({
					projectId: id,
					name: patch.name,
				});
			}

			if (patch.color !== undefined || patch.hideImage !== undefined) {
				ensureProjectInSidebar(id);
				collections.sidebarProjects.update(id, (draft) => {
					if (patch.color !== undefined) draft.color = patch.color;
					if (patch.hideImage !== undefined) draft.hideImage = patch.hideImage;
				});
			}
		},
	});
}
