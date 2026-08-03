import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	launchesToPaneLayoutInputs,
	toProvisionWorkspaceRequest,
	type WorkspaceCreateSnapshot,
	type WorkspacesCreateInput,
} from "./request";
import { useWorkspaceLaunch } from "./useWorkspaceLaunch";
import { createWorkspaceProvisioningAdapter } from "./useWorkspaceProvisioningAdapter";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

export interface WorkspaceProvisioningSubmitArgs {
	hostId: string;
	snapshot: WorkspaceCreateSnapshot;
}

export type WorkspaceProvisioningSubmitOutcome =
	| { ok: true; workspaceId: string; autoNameWarning?: string }
	| { ok: false; error: string };

export interface WorkspaceProvisioningSubmitHandle {
	workspaceId: string;
	completed: Promise<WorkspaceProvisioningSubmitOutcome>;
}

export interface WorkspaceProvisioningSubmissionApi {
	submit: (
		args: WorkspaceProvisioningSubmitArgs,
	) => WorkspaceProvisioningSubmitHandle;
}

export type { WorkspacesCreateInput };

export function useWorkspaceProvisioningSubmission(): WorkspaceProvisioningSubmissionApi {
	const hostService = useLocalHostService();
	const { t } = useTranslation();
	const { machineId, activeHostUrl } = hostService;
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const collections = useCollections();
	const relayUrl = useRelayUrl();
	const workspaceLaunch = useWorkspaceLaunch(null);

	const submit = useCallback(
		(
			args: WorkspaceProvisioningSubmitArgs,
		): WorkspaceProvisioningSubmitHandle => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error("Workspace provisioning requires a local request id");
			}

			const hostUrl = organizationId
				? resolveHostUrl({
						hostId: args.hostId,
						machineId,
						activeHostUrl,
						organizationId,
						relayUrl,
					})
				: null;

			if (!organizationId || !hostUrl) {
				const error = !organizationId
					? "No active organization"
					: getHostServiceUnavailableMessage(hostService, t, {
							action: t("workspace.createAction"),
						});
				return {
					workspaceId,
					completed: Promise.resolve({ ok: false, error }),
				};
			}

			const adapter = createWorkspaceProvisioningAdapter(hostUrl);
			const beginPromise = workspaceLaunch.begin({
				adapter,
				request: toProvisionWorkspaceRequest(args.snapshot),
			});

			const completed = beginPromise
				.then<WorkspaceProvisioningSubmitOutcome>((operation) => {
					if (!operation.workspaceId) {
						const error =
							operation.failure?.message ?? "Workspace provisioning failed";
						return { ok: false, error };
					}

					const actualWorkspaceId = operation.workspaceId;
					const launchInputs = launchesToPaneLayoutInputs(operation);
					writeWorkspacePaneLayout(
						collections,
						{
							id: actualWorkspaceId,
							projectId: args.snapshot.projectId,
							isUnnamed: !args.snapshot.name,
						},
						launchInputs.terminals,
						launchInputs.agents,
					);
					if (operation.state === "failed") {
						return {
							ok: false,
							error: operation.failure?.message ?? "Workspace setup failed",
						};
					}
					return { ok: true, workspaceId: actualWorkspaceId };
				})
				.catch<WorkspaceProvisioningSubmitOutcome>((error: unknown) => {
					const message =
						error instanceof Error ? error.message : String(error);
					return { ok: false, error: message };
				});

			return { workspaceId, completed };
		},
		[
			activeHostUrl,
			collections,
			hostService,
			machineId,
			organizationId,
			relayUrl,
			t,
			workspaceLaunch,
		],
	);

	return { submit };
}
