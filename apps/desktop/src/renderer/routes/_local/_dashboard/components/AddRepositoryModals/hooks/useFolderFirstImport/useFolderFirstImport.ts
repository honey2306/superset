import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { getBaseName } from "renderer/lib/pathBasename";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useRequestGitInitConfirm } from "renderer/stores/git-init-confirm";
import {
	beginProjectProvisioning,
	createWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";

export interface UseFolderFirstImportResult {
	start: () => Promise<ProjectSetupResult | null>;
	startAtPath: (repoPath: string) => Promise<ProjectSetupResult | null>;
	isPending: boolean;
}

interface MatchingProject {
	id: string;
	name: string;
}

export function useFolderFirstImport(options?: {
	onError?: (message: string) => void;
	onMultipleProjects?: (input: { candidates: MatchingProject[] }) => void;
}): UseFolderFirstImportResult {
	const hostService = useLocalHostService();
	const { t } = useTranslation();
	const { waitForHostReady } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const requestGitInit = useRequestGitInitConfirm();
	const { onError, onMultipleProjects } = options ?? {};
	const [isPending, setIsPending] = useState(false);

	const startAtPath = useCallback(
		async (repoPath: string): Promise<ProjectSetupResult | null> => {
			setIsPending(true);
			try {
				const activeHostUrl = await waitForHostReady();
				if (!activeHostUrl) {
					onError?.(
						getHostServiceUnavailableMessage(hostService, t, {
							action: t("project.importFolderAction"),
						}),
					);
					return null;
				}

				const client = getHostServiceClientByUrl(activeHostUrl);
				const adapter = createWorkspaceProvisioningAdapter(activeHostUrl);
				const projectName = getBaseName(repoPath);
				const provision = (
					request: Parameters<typeof beginProjectProvisioning>[0]["request"],
				) =>
					beginProjectProvisioning({
						hostUrl: activeHostUrl,
						adapter,
						request,
					});
				let candidates: MatchingProject[];
				try {
					const response = await client.project.findByPath.query({ repoPath });

					// Folder isn't a git repo yet: offer to `git init` it, then import
					// via the create path with init enabled.
					if ("needsGitInit" in response && response.needsGitInit) {
						const confirmed = await requestGitInit(repoPath);
						if (!confirmed) return null;
						const result = await provision({
							idempotencyKey: `project-import:${repoPath}:initialize`,
							project: {
								kind: "import",
								path: repoPath,
								name: projectName,
								git: "initialize-with-consent",
							},
							source: { kind: "main" },
						});
						finalizeSetup(activeHostUrl, result);
						return result;
					}

					candidates = response.candidates;
				} catch (err) {
					onError?.(err instanceof Error ? err.message : String(err));
					return null;
				}

				const [only, ...rest] = candidates;
				if (rest.length > 0) {
					if (onMultipleProjects) {
						onMultipleProjects({ candidates });
					} else {
						onError?.(
							`Multiple projects use this repository (${candidates.length}). Open the project you want from settings to set it up on this device.`,
						);
					}
					return null;
				}

				try {
					let result: ProjectSetupResult;
					if (only) {
						result = await provision({
							idempotencyKey: `project-setup:${only.id}:${repoPath}`,
							project: {
								kind: "setup-existing",
								projectId: only.id,
								origin: { name: projectName },
								mode: { kind: "import", path: repoPath },
							},
							source: { kind: "main" },
						});
					} else {
						result = await provision({
							idempotencyKey: `project-import:${repoPath}`,
							project: {
								kind: "import",
								path: repoPath,
								name: projectName,
								git: "require",
							},
							source: { kind: "main" },
						});
					}
					finalizeSetup(activeHostUrl, result);
					return result;
				} catch (err) {
					onError?.(err instanceof Error ? err.message : String(err));
					return null;
				}
			} finally {
				setIsPending(false);
			}
		},
		[
			waitForHostReady,
			finalizeSetup,
			hostService,
			t,
			onError,
			onMultipleProjects,
			requestGitInit,
		],
	);

	const start = useCallback(async (): Promise<ProjectSetupResult | null> => {
		// Pick the folder first — the native dialog is a local Electron call and
		// must not wait on the host service. Only the registration below needs it.
		setIsPending(true);
		try {
			const picked = await selectDirectory.mutateAsync({
				title: "Import existing folder",
			});
			if (picked.canceled || !picked.path) return null;
			return await startAtPath(picked.path);
		} catch (err) {
			onError?.(err instanceof Error ? err.message : String(err));
			return null;
		} finally {
			setIsPending(false);
		}
	}, [onError, selectDirectory, startAtPath]);

	return { start, startAtPath, isPending };
}
