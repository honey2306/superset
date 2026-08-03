import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	beginProjectProvisioning,
	createWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";

export interface EnsureV2ProjectResult {
	hostUrl: string;
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string | null;
}

export function useEnsureV2Project(): (args: {
	repoPath: string;
	name: string;
}) => Promise<EnsureV2ProjectResult> {
	const hostServiceContext = useLocalHostService();
	const { t } = useTranslation();
	const { activeHostUrl } = hostServiceContext;

	return useCallback(
		async ({ repoPath, name }) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostServiceContext, t, {
						action: t("project.importAction"),
					}),
				);
			}
			const hostService = getHostServiceClientByUrl(activeHostUrl);

			// findByPath is local-only: a candidate means this host already has
			// the project, so setup just re-ensures the main workspace.
			const found = await hostService.project.findByPath.query({ repoPath });
			const candidate = found.candidates[0];
			if (candidate) {
				const setupResult = await beginProjectProvisioning({
					hostUrl: activeHostUrl,
					adapter: createWorkspaceProvisioningAdapter(activeHostUrl),
					request: {
						idempotencyKey: `project-setup:${candidate.id}:${repoPath}`,
						project: {
							kind: "setup-existing",
							projectId: candidate.id,
							origin: { name },
							mode: { kind: "import", path: repoPath },
						},
						source: { kind: "main" },
					},
				});
				return {
					hostUrl: activeHostUrl,
					projectId: candidate.id,
					repoPath: setupResult.repoPath,
					mainWorkspaceId: setupResult.mainWorkspaceId,
				};
			}

			const created = await beginProjectProvisioning({
				hostUrl: activeHostUrl,
				adapter: createWorkspaceProvisioningAdapter(activeHostUrl),
				request: {
					idempotencyKey: `project-import:${repoPath}`,
					project: {
						kind: "import",
						path: repoPath,
						name,
						git: "require",
					},
					source: { kind: "main" },
				},
			});
			return {
				hostUrl: activeHostUrl,
				projectId: created.projectId,
				repoPath: created.repoPath,
				mainWorkspaceId: created.mainWorkspaceId,
			};
		},
		[activeHostUrl, hostServiceContext, t],
	);
}
