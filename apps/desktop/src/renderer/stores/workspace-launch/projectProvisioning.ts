import type {
	ProvisioningAdapter,
	ProvisionWorkspaceRequest,
	WorkspaceOperation,
} from "@superset/workspace-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { ProjectSetupResult } from "renderer/react-query/projects";

export async function beginProjectProvisioning(args: {
	hostUrl: string;
	adapter: ProvisioningAdapter;
	request: ProvisionWorkspaceRequest;
}): Promise<ProjectSetupResult> {
	const { operation } = await args.adapter.begin(args.request);
	assertSuccessfulOperation(operation);
	if (!operation.projectId || !operation.workspaceId) {
		throw new Error(
			"Provisioning completed without a project or main workspace",
		);
	}

	const snapshot = await getHostServiceClientByUrl(
		args.hostUrl,
	).workspaceCatalog.snapshot.query();
	const project = snapshot.projects.find(
		(candidate) => candidate.id === operation.projectId,
	);
	if (!project) {
		throw new Error(
			`Provisioned project ${operation.projectId} is missing from Catalog`,
		);
	}
	return {
		projectId: operation.projectId,
		repoPath: project.repoPath,
		mainWorkspaceId: operation.workspaceId,
	};
}

function assertSuccessfulOperation(operation: WorkspaceOperation): void {
	if (operation.state === "failed" || operation.state === "cancelled") {
		throw new Error(
			operation.failure?.message ?? "Workspace provisioning failed",
		);
	}
}
