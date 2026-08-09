import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DndProvider } from "react-dnd";
import { HiOutlineWifi } from "react-icons/hi2";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { Paywall } from "renderer/components/Paywall";
import { env } from "renderer/env.renderer";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { useSignOut } from "renderer/hooks/useSignOut";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useTranslation } from "renderer/providers/I18nProvider";
import { GitInitConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/components/GitInitConfirmDialog";
import { DaemonAutoUpdateFailureDialog } from "renderer/routes/_authenticated/components/DaemonAutoUpdateFailureDialog";
import { DashboardNewWorkspaceModal } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal";
import { DiffThemeSync } from "renderer/routes/_authenticated/components/DiffThemeSync";
import { AgentSessionLaunchEffects } from "renderer/screens/main/components/AgentSessionLaunchEffects";
import { useSettingsStore } from "renderer/stores/settings-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { setPaneWorkspaceRunState } from "renderer/stores/tabs/workspace-run";
import { MOCK_ORG_ID, NOTIFICATION_EVENTS } from "shared/constants";
import { AgentHooks } from "./components/AgentHooks";
import { DockBadgeController } from "./components/DockBadgeController";
import { FileMenuListener } from "./components/FileMenuListener";
import { TeardownLogsDialog } from "./components/TeardownLogsDialog";
import { V2NotificationController } from "./components/V2NotificationController";
import { createPierreWorker } from "./lib/pierreWorker";
import { CollectionsProvider } from "./providers/CollectionsProvider";
import { DeletingWorkspacesProvider } from "./providers/DeletingWorkspacesProvider";
import { HostWorkspacesProvider } from "./providers/HostWorkspacesProvider";
import { LocalHostServiceProvider } from "./providers/LocalHostServiceProvider";
import { WorkspaceCatalogProvider } from "./providers/WorkspaceCatalogProvider";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

// Hoisted for stable props identity — <Navigate> re-navigates every re-render otherwise (react error #185 loop, #5729)
const signInRedirect = <Navigate to="/sign-in" replace />;
const onboardingRedirect = <Navigate to="/onboarding" replace />;

const SESSION_PENDING_TIMEOUT_MS = 15_000;

function AuthenticatedLayout() {
	const { t } = useTranslation();
	const {
		data: session,
		isPending,
		isRefetching,
		refetch,
	} = authClient.useSession();
	const hasLocalToken = !!getAuthToken();
	const isOnline = useOnlineStatus();
	const navigate = useNavigate();
	const location = useLocation();
	const setOriginRoute = useSettingsStore((s) => s.setOriginRoute);
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const isSignedIn = env.SKIP_ENV_VALIDATION || !!session?.user;
	const _activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const isAuthPending =
		(isPending || (isRefetching && !session?.user && hasLocalToken)) &&
		!env.SKIP_ENV_VALIDATION;
	const authPendingTimedOut = useDelayElapsed(
		isAuthPending,
		SESSION_PENDING_TIMEOUT_MS,
	);
	const signOut = useSignOut();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [isCreatingOrg, setIsCreatingOrg] = useState(false);

	useAgentHookListener();

	// Single-user setup: auto-create personal org if missing
	const activeOrganizationId = _activeOrganizationId;
	useEffect(() => {
		if (!session?.user || activeOrganizationId || isCreatingOrg) return;

		// User logged in but has no org — create one automatically
		setIsCreatingOrg(true);
		const userId = session.user.id;
		const slug = `${userId.slice(0, 8)}-team`;

		apiTrpcClient.organization.create
			.mutate({
				name: "My Workspace",
				slug,
			})
			.then((org) => {
				return authClient.organization.setActive({
					organizationId: org.id,
				});
			})
			.then(() => {
				return refetch();
			})
			.catch((error) => {
				console.error("Failed to create personal org:", error);
				setIsCreatingOrg(false);
			});
	}, [session?.user, activeOrganizationId, isCreatingOrg, refetch]);

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
				event.type === NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE &&
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
				setPaneWorkspaceRunState(event.data.paneId, nextState);
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

	// Never redirect while the session is unresolved — a redirect held open
	// across re-renders loops the router until the renderer OOMs (#5729).
	if (isAuthPending) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<Spinner className="size-8" />
				{authPendingTimedOut && (
					<>
						<div className="text-center select-text cursor-text">
							<h2 className="text-lg font-medium">
								Still restoring your session
							</h2>
							<p className="text-sm text-fg-mute">
								Superset can't confirm your sign-in with the server.
							</p>
						</div>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => refetch()}>
								Retry
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={isSigningOut}
								onClick={async () => {
									setIsSigningOut(true);
									try {
										await signOut();
									} finally {
										void navigate({ to: "/sign-in", replace: true });
									}
								}}
							>
								Sign out
							</Button>
						</div>
					</>
				)}
			</div>
		);
	}

	if (!isSignedIn && hasLocalToken && !isOnline) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<HiOutlineWifi className="size-12 text-fg-mute" />
				<div className="text-center">
					<h2 className="text-lg font-medium">{t("offline.title")}</h2>
					<p className="text-sm text-fg-mute">{t("offline.description")}</p>
				</div>
				<Button variant="outline" size="sm" onClick={() => refetch()}>
					{t("offline.retry")}
				</Button>
			</div>
		);
	}

	if (!isSignedIn) {
		return signInRedirect;
	}

	if (!activeOrganizationId) {
		return (
			<div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
				<Spinner />
				<p className="text-sm text-fg-mute">Loading...</p>
			</div>
		);
	}

	if (
		session?.user &&
		!session.user.onboardedAt &&
		!location.pathname.startsWith("/onboarding")
	) {
		return onboardingRedirect;
	}

	return (
		<DndProvider manager={dragDropManager}>
			<CollectionsProvider>
				{/* GlobalBrowserLifecycle removed with internal browser feature */}
				<LocalHostServiceProvider>
					<WorkspaceCatalogProvider>
						<HostWorkspacesProvider>
							{" "}
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
									<V2NotificationController />
									<DockBadgeController />
									<DaemonAutoUpdateFailureDialog />
									<Outlet />
									<AgentSessionLaunchEffects />
									{isV2CloudEnabled ? (
										<DashboardNewWorkspaceModal />
									) : (
										<NewWorkspaceModal />
									)}
									<GitInitConfirmDialog />
									<TeardownLogsDialog />
									<Paywall />
								</WorkerPoolContextProvider>
							</DeletingWorkspacesProvider>
						</HostWorkspacesProvider>
					</WorkspaceCatalogProvider>
				</LocalHostServiceProvider>
			</CollectionsProvider>
		</DndProvider>
	);
}
