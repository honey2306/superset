import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { WorkspaceClientProvider } from "@superset/workspace-client";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { DndProvider } from "react-dnd";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { HostServiceTRPCProvider } from "renderer/providers/HostServiceTRPCProvider";
import { GitInitConfirmDialog } from "renderer/routes/_local/_dashboard/components/AddRepositoryModals/components/GitInitConfirmDialog";
import { DaemonAutoUpdateFailureDialog } from "renderer/routes/_local/components/DaemonAutoUpdateFailureDialog";
import { DashboardNewWorkspaceModal } from "renderer/routes/_local/components/DashboardNewWorkspaceModal";
import { DiffThemeSync } from "renderer/routes/_local/components/DiffThemeSync";
import { AgentSessionLaunchEffects } from "renderer/screens/main/components/AgentSessionLaunchEffects";
import { useSettingsStore } from "renderer/stores/settings-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { DockBadgeController } from "./components/DockBadgeController";
import { FileMenuListener } from "./components/FileMenuListener";
import { NotificationController } from "./components/NotificationController";
import { TeardownLogsDialog } from "./components/TeardownLogsDialog";
import { createPierreWorker } from "./lib/pierreWorker";
import { DeletingWorkspacesProvider } from "./providers/DeletingWorkspacesProvider";
import {
	LocalHostServiceProvider,
	useLocalHostService,
} from "./providers/LocalHostServiceProvider";
import { LocalProductStateProvider } from "./providers/LocalProductStateProvider";
import { WorkspaceCatalogProvider } from "./providers/WorkspaceCatalogProvider";

export const Route = createFileRoute("/_local")({
	component: LocalLayout,
});

function LocalLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const setOriginRoute = useSettingsStore((s) => s.setOriginRoute);

	useAgentHookListener();

	// Seed the parked-terminal eviction cap from settings (SUPER-1545).
	const { data: parkedRuntimeCap } =
		electronTrpc.settings.getTerminalParkedRuntimeCap.useQuery();
	useEffect(() => {
		if (parkedRuntimeCap !== undefined) {
			terminalRuntimeRegistry.setParkedRuntimeCap(parkedRuntimeCap);
		}
	}, [parkedRuntimeCap]);

	// Update workspace-run pane state on terminal exit
	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (
				event.type === NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE &&
				event.data
			) {
				localStorage.setItem("lastViewedWorkspaceId", event.data.workspaceId);
				const source = event.data.source;
				void navigate({
					to: "/workspace/$workspaceId",
					params: { workspaceId: event.data.workspaceId },
					search:
						source.type === "terminal"
							? {
									terminalId: source.id,
									focusRequestId: crypto.randomUUID(),
								}
							: {
									focusRequestId: crypto.randomUUID(),
								},
				});
				return;
			}

			if (
				event.type !== NOTIFICATION_EVENTS.TERMINAL_EXIT ||
				!event.data?.paneId
			) {
				return;
			}
			const pane = useTabsStore.getState().panes[event.data.paneId];
			if (pane?.workspaceRun?.state === "running") {
				const nextState =
					event.data.reason === "killed"
						? "stopped-by-user"
						: "stopped-by-exit";
				useTabsStore.getState().setPaneWorkspaceRun(event.data.paneId, {
					...pane.workspaceRun,
					state: nextState,
				});
			}
		},
	});

	useEffect(() => {
		if (!location.pathname.startsWith("/settings")) {
			setOriginRoute(location.pathname);
		}
	}, [location.pathname, setOriginRoute]);

	// Menu navigation subscription
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "appearance";
				navigate({ to: `/settings/${section}` as "/settings/appearance" });
			} else if (event.type === "open-workspace") {
				navigate({ to: `/workspace/${event.data.workspaceId}` });
			}
		},
	});

	return (
		<DndProvider manager={dragDropManager}>
			<LocalProductStateProvider>
				{/* GlobalBrowserLifecycle removed with internal browser feature */}
				<LocalHostServiceProvider>
					<LocalHostApiProviders>
						<WorkspaceCatalogProvider>
							<DeletingWorkspacesProvider>
								<WorkerPoolContextProvider
									poolOptions={{
										workerFactory: createPierreWorker,
										poolSize: 8,
									}}
									highlighterOptions={{ preferredHighlighter: "shiki-wasm" }}
								>
									<DiffThemeSync />
									<AgentHooks />
									<FileMenuListener />
									<NotificationController />
									<DockBadgeController />
									<DaemonAutoUpdateFailureDialog />
									<Outlet />
									<AgentSessionLaunchEffects />
									<DashboardNewWorkspaceModal />
									<GitInitConfirmDialog />
									<TeardownLogsDialog />
								</WorkerPoolContextProvider>
							</DeletingWorkspacesProvider>
						</WorkspaceCatalogProvider>
					</LocalHostApiProviders>
				</LocalHostServiceProvider>
			</LocalProductStateProvider>
		</DndProvider>
	);
}

function LocalHostApiProviders({ children }: { children: React.ReactNode }) {
	const { activeHostUrl } = useLocalHostService();
	if (!activeHostUrl) return null;

	return (
		<HostServiceTRPCProvider>
			<WorkspaceClientProvider
				cacheKey="embedded-host"
				hostUrl={activeHostUrl}
				headers={() => getHostServiceHeaders(activeHostUrl)}
				wsToken={() => getHostServiceWsToken(activeHostUrl)}
			>
				{children}
			</WorkspaceClientProvider>
		</HostServiceTRPCProvider>
	);
}
