import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import {
	launchesToPaneLayoutInputs,
	toProvisionWorkspaceRequest,
	type WorkspaceCreateSnapshot,
} from "./request";
import { useWorkspaceLaunch } from "./useWorkspaceLaunch";
import { useWorkspaceProvisioningAdapter } from "./useWorkspaceProvisioningAdapter";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

type PendingSetupOverrides = {
	resolveInitialCommands?: (serverCommands: string[] | null) => string[] | null;
	agentLaunchRequest?: AgentLaunchRequest;
};

function appendAgentLaunch(
	input: WorkspaceCreateSnapshot,
	launchRequest: AgentLaunchRequest | undefined,
): WorkspaceCreateSnapshot {
	if (!launchRequest) return input;
	const agent = launchRequest.terminal.hostAgent;
	return agent ? { ...input, agents: [...(input.agents ?? []), agent] } : input;
}

export function useWorkspaceCreate() {
	const navigate = useNavigate();
	const adapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(adapter);
	const collections = useLocalCollections();
	const [isPending, setIsPending] = useState(false);

	const mutateAsyncWithPendingSetup = useCallback(
		async (
			input: WorkspaceCreateSnapshot,
			pendingSetup?: PendingSetupOverrides,
		) => {
			if (!adapter) throw new Error("Workspace host is not available");
			setIsPending(true);
			try {
				const withAgent = appendAgentLaunch(
					{ ...input, id: input.id ?? crypto.randomUUID() },
					pendingSetup?.agentLaunchRequest,
				);
				const request = toProvisionWorkspaceRequest(withAgent);
				if (pendingSetup?.resolveInitialCommands?.([]) !== null) {
					request.initialSessions = [
						{ key: "setup", kind: "setup", requirement: "required" },
						...(request.initialSessions ?? []),
					];
				}
				const operation = await workspaceLaunch.begin({ adapter, request });
				if (!operation.workspaceId) {
					throw new Error(
						operation.failure?.message ?? "Workspace provisioning failed",
					);
				}
				const launchInputs = launchesToPaneLayoutInputs(operation);
				writeWorkspacePaneLayout(
					collections,
					{
						id: operation.workspaceId,
						projectId: withAgent.projectId,
						isUnnamed: !withAgent.name,
					},
					launchInputs.terminals,
					launchInputs.agents,
				);
				await navigateToWorkspace(operation.workspaceId, navigate);
				return operation;
			} finally {
				setIsPending(false);
			}
		},
		[adapter, collections, navigate, workspaceLaunch],
	);

	return { isPending, mutateAsyncWithPendingSetup };
}

export function useWorkspaceCreateFromPr() {
	const navigate = useNavigate();
	const adapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(adapter);
	const collections = useLocalCollections();
	const [isPending, setIsPending] = useState(false);

	const mutateAsyncWithSetup = useCallback(
		async (
			input: { projectId: string; prUrl: string },
			agentLaunchRequest?: AgentLaunchRequest,
		) => {
			if (!adapter) throw new Error("Workspace host is not available");
			setIsPending(true);
			try {
				const prNumber = Number.parseInt(
					input.prUrl.match(/(?:\/|#)(\d+)(?:\D*)$/)?.[1] ?? "",
					10,
				);
				if (!Number.isInteger(prNumber) || prNumber <= 0) {
					throw new Error("Unable to resolve pull request number");
				}
				const request = toProvisionWorkspaceRequest(
					appendAgentLaunch(
						{
							id: crypto.randomUUID(),
							projectId: input.projectId,
							pr: prNumber,
						},
						agentLaunchRequest,
					),
				);
				request.idempotencyKey = `pr-workspace:${input.projectId}:${prNumber}`;
				const operation = await workspaceLaunch.begin({ adapter, request });
				if (!operation.workspaceId || operation.state === "failed") {
					throw new Error(
						operation.failure?.message ?? "Workspace provisioning failed",
					);
				}
				const launchInputs = launchesToPaneLayoutInputs(operation);
				writeWorkspacePaneLayout(
					collections,
					{
						id: operation.workspaceId,
						projectId: input.projectId,
						isUnnamed: true,
					},
					launchInputs.terminals,
					launchInputs.agents,
				);
				await navigateToWorkspace(operation.workspaceId, navigate);
				return operation;
			} finally {
				setIsPending(false);
			}
		},
		[adapter, collections, navigate, workspaceLaunch],
	);

	return { isPending, mutateAsyncWithSetup };
}
