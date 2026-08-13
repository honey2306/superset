import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffectEvent, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import { useVisibleSidebarWorkspaceIds } from "renderer/routes/_local/hooks/useVisibleSidebarWorkspaceIds";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { AgentLifecycleEvent } from "shared/notification-types";
import {
	HostNotificationSubscriber,
	type HostNotificationWorkspaceState,
} from "./components/HostNotificationSubscriber";
import { forwardElectronLifecycleFallback } from "./lib/electronLifecycleFallback";

interface WorkspaceHostRow {
	workspaceId: string;
	name: string;
	branch: string;
}

interface HostNotificationSubscriberGroup {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
}

type ElectronNotificationEventName =
	(typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

type ElectronNotificationEvent =
	| {
			type: typeof NOTIFICATION_EVENTS.AGENT_LIFECYCLE;
			data?: AgentLifecycleEvent;
	  }
	| {
			type: Exclude<
				ElectronNotificationEventName,
				typeof NOTIFICATION_EVENTS.AGENT_LIFECYCLE
			>;
			data?: unknown;
	  };

/**
 * Mounts one notification listener per host-service URL so backgrounded
 * workspaces update their sidebar status indicator and play the finish sound.
 * Sibling to `AgentHooks`; rendered at the authenticated layout level.
 *
 * A host subscriber subscribes with workspaceId `*` and filters against the
 * workspaces assigned to that host. This keeps the topology O(1 listener per
 * host), not O(1 listener and settings observer per workspace).
 */
export function NotificationController() {
	const collections = useLocalCollections();
	const { activeHostUrl } = useLocalHostService();
	const visibleWorkspaceIds = useVisibleSidebarWorkspaceIds();
	const { workspaces: hostWorkspaces } = useWorkspaceCatalog();
	const allWorkspaceHosts = useMemo<WorkspaceHostRow[]>(
		() =>
			hostWorkspaces.map((workspace) => ({
				workspaceId: workspace.id,
				name: workspace.name,
				branch: workspace.branch,
			})),
		[hostWorkspaces],
	);
	const { data: allLocalWorkspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaceLocalState: collections.workspaceLocalState })
				.select(({ workspaceLocalState }) => ({
					workspaceId: workspaceLocalState.workspaceId,
					paneLayout: workspaceLocalState.paneLayout,
				})),
		[collections],
	);
	const workspaceHosts = useMemo(
		() =>
			allWorkspaceHosts.filter((workspace) =>
				visibleWorkspaceIds.has(workspace.workspaceId),
			),
		[allWorkspaceHosts, visibleWorkspaceIds],
	);
	const localWorkspaceRows = useMemo(
		() =>
			allLocalWorkspaceRows.filter((workspace) =>
				visibleWorkspaceIds.has(workspace.workspaceId),
			),
		[allLocalWorkspaceRows, visibleWorkspaceIds],
	);
	const workspaceStatesById = useMemo(
		() =>
			getNotificationWorkspaceStatesById({
				workspaceHosts,
				localWorkspaceRows,
			}),
		[workspaceHosts, localWorkspaceRows],
	);
	const hostGroups = useMemo(
		() =>
			groupWorkspacesByHostUrl({
				workspaceHosts,
				workspaceStatesById,
				activeHostUrl,
			}),
		[workspaceHosts, workspaceStatesById, activeHostUrl],
	);

	const handleElectronAgentLifecycle = useEffectEvent(
		(event: ElectronNotificationEvent) => {
			if (event.type !== NOTIFICATION_EVENTS.AGENT_LIFECYCLE) return;
			const data = event.data;
			if (!data?.workspaceId || !data.terminalId) return;
			const workspace = workspaceStatesById.get(data.workspaceId);
			if (!workspace) return;

			// Adopted shells keep their launch-time host-service hook URL. When
			// that URL is stale, forward once into the authoritative host EventBus.
			// The EventBus subscriber owns sound/native UI, preventing a duplicate
			// main-process notification for this same fallback hook.
			if (!activeHostUrl) return;
			forwardElectronLifecycleFallback({
				event: data,
				paneLayout: workspace.paneLayout,
				client: getHostServiceClientByUrl(activeHostUrl),
			})?.catch((error) => {
				console.warn(
					"[notifications] failed to forward lifecycle event to host:",
					error,
				);
			});
		},
	);

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: handleElectronAgentLifecycle,
	});

	return (
		<>
			{hostGroups.map((group) => (
				<HostNotificationSubscriber
					key={group.hostUrl}
					hostUrl={group.hostUrl}
					workspaces={group.workspaces}
				/>
			))}
		</>
	);
}

function getNotificationWorkspaceStatesById({
	workspaceHosts,
	localWorkspaceRows,
}: {
	workspaceHosts: WorkspaceHostRow[];
	localWorkspaceRows: Array<{
		workspaceId: string;
		paneLayout: unknown;
	}>;
}): Map<string, HostNotificationWorkspaceState> {
	const paneLayoutsByWorkspaceId = new Map(
		localWorkspaceRows.map((row) => [
			row.workspaceId,
			row.paneLayout as WorkspaceState<PaneViewerData>,
		]),
	);

	const statesById = new Map(
		localWorkspaceRows.map((row) => [
			row.workspaceId,
			{
				workspaceId: row.workspaceId,
				workspaceName: "Workspace",
				paneLayout: paneLayoutsByWorkspaceId.get(row.workspaceId) ?? null,
			},
		]),
	);

	for (const workspace of workspaceHosts) {
		statesById.set(workspace.workspaceId, {
			workspaceId: workspace.workspaceId,
			workspaceName:
				workspace.name.trim() || workspace.branch.trim() || "Workspace",
			paneLayout: paneLayoutsByWorkspaceId.get(workspace.workspaceId) ?? null,
		});
	}

	return statesById;
}

function groupWorkspacesByHostUrl({
	workspaceHosts,
	workspaceStatesById,
	activeHostUrl,
}: {
	workspaceHosts: WorkspaceHostRow[];
	workspaceStatesById: Map<string, HostNotificationWorkspaceState>;
	activeHostUrl: string | null;
}): HostNotificationSubscriberGroup[] {
	const groups = new Map<string, HostNotificationWorkspaceState[]>();
	const hostedWorkspaceIds = new Set<string>();

	for (const workspace of workspaceHosts) {
		if (!activeHostUrl) continue;
		const group = groups.get(activeHostUrl) ?? [];
		const state = workspaceStatesById.get(workspace.workspaceId);
		if (state) group.push(state);
		groups.set(activeHostUrl, group);
		hostedWorkspaceIds.add(workspace.workspaceId);
	}

	if (activeHostUrl) {
		const localGroup = groups.get(activeHostUrl) ?? [];
		for (const state of workspaceStatesById.values()) {
			if (hostedWorkspaceIds.has(state.workspaceId)) continue;
			localGroup.push(state);
		}
		if (localGroup.length > 0) {
			groups.set(activeHostUrl, localGroup);
		}
	}

	return [...groups.entries()].map(([hostUrl, workspaces]) => ({
		hostUrl,
		workspaces,
	}));
}
