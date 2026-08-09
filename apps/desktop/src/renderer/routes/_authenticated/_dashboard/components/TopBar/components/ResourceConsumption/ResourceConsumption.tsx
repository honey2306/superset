import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineBarsArrowDown,
	HiOutlineCpuChip,
} from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	logStressEvent,
	useRenderStressInstrumentation,
} from "renderer/lib/performance/stress-instrumentation";
import { useTranslation } from "renderer/providers/I18nProvider";
import { navigateToWorkspace as navigateToV1Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useTabsStore } from "renderer/stores/tabs/store";
import { AppResourceSection } from "./components/AppResourceSection";
import { MetricBadge } from "./components/MetricBadge";
import { WorkspaceResourceSection } from "./components/WorkspaceResourceSection";
import {
	getResourceMonitorRefetchInterval,
	shouldQueryResourceMonitor,
} from "./resourceConsumptionPolicy";
import type { SessionMetrics, SortOption, UsageValues } from "./types";
import { formatCpu, formatMemory, formatPercent } from "./utils/formatters";
import { normalizeResourceMetricsSnapshot } from "./utils/normalizeSnapshot";
import { getTrackedHostMemorySeverity } from "./utils/resourceSeverity";

function getTotalUsage(
	cpu: number | undefined,
	memory: number | undefined,
): UsageValues {
	return {
		cpu: cpu ?? 0,
		memory: memory ?? 0,
	};
}

function getTrackedMemorySharePercent(
	totalMemory: number,
	hostTotalMemory: number,
): number {
	if (hostTotalMemory <= 0) return 0;
	return (totalMemory / hostTotalMemory) * 100;
}

interface ResourceConsumptionProps {
	className?: string;
}

export function ResourceConsumption({ className }: ResourceConsumptionProps) {
	const [open, setOpen] = useState(false);
	const { t } = useTranslation();
	const { data: enabled } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();

	useRenderStressInstrumentation("ResourceConsumptionTrigger", {
		warnAt: 25,
		getDetails: () => ({ open }),
	});

	if (!enabled) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={t("dashboard.resourceConsumption")}
							className={cn(
								"no-drag relative text-fg-mute hover:text-fg",
								className,
							)}
						>
							<HiOutlineCpuChip className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
					{t("dashboard.resources")}
				</TooltipContent>
			</Tooltip>

			{open && <ResourceConsumptionContent onClose={() => setOpen(false)} />}
		</Popover>
	);
}

interface ResourceConsumptionContentProps {
	onClose: () => void;
}

function ResourceConsumptionContent({
	onClose,
}: ResourceConsumptionContentProps) {
	const [sortOption, setSortOption] = useState<SortOption>("memory");
	const { t } = useTranslation();
	const sortLabels: Record<SortOption, string> = {
		memory: t("dashboard.sortMemory"),
		cpu: "CPU",
		name: t("dashboard.sortName"),
		sidebar: t("dashboard.sortSidebar"),
	};
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(
		new Set(),
	);

	const navigate = useNavigate();
	const panes = useTabsStore((state) => state.panes);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);
	const setFocusedPane = useTabsStore((state) => state.setFocusedPane);
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;

	useRenderStressInstrumentation("ResourceConsumptionContent", {
		warnAt: 25,
	});

	const { data: rawSidebarProjects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.v2SidebarProjects })
				.orderBy(({ sp }) => sp.tabOrder, "asc")
				.select(({ sp }) => ({ projectId: sp.projectId })),
		[collections],
	);

	const { data: rawSidebarWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.v2WorkspaceLocalState })
				.orderBy(({ ws }) => ws.sidebarState.tabOrder, "asc")
				.select(({ ws }) => ({
					workspaceId: ws.workspaceId,
					isHidden: ws.sidebarState.isHidden,
					paneLayout: ws.paneLayout,
				})),
		[collections],
	);

	const sidebarProjectOrder = useMemo(
		() => rawSidebarProjects.map((p) => p.projectId),
		[rawSidebarProjects],
	);

	const sidebarWorkspaceOrder = useMemo(
		() =>
			getVisibleSidebarWorkspaces(rawSidebarWorkspaces).map(
				(w) => w.workspaceId,
			),
		[rawSidebarWorkspaces],
	);

	const shouldQueryMetrics = shouldQueryResourceMonitor({
		enabled: true,
		open: true,
	});

	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.resourceMetrics.getSnapshot.useQuery(
		{
			mode: "interactive",
			surface: "v1",
			organizationId,
		},
		{
			enabled: shouldQueryMetrics,
			refetchInterval: getResourceMonitorRefetchInterval(true),
		},
	);

	useEffect(() => {
		if (!isFetching) return;
		logStressEvent("resource-monitor.fetch", { surface: "v1" });
	}, [isFetching]);

	const normalizedSnapshot = useMemo(
		() => normalizeResourceMetricsSnapshot(snapshot),
		[snapshot],
	);

	const getPaneName = (session: SessionMetrics): string => {
		const pane = panes[session.paneId];
		return (
			pane?.name ||
			t("dashboard.paneFallback", { id: session.paneId.slice(0, 6) })
		);
	};

	const navigateToWorkspace = (workspaceId: string) => {
		void navigateToV1Workspace(workspaceId, navigate);
		onClose();
	};

	const navigateToPane = (workspaceId: string, paneId: string) => {
		const pane = panes[paneId];
		if (pane) {
			setActiveTab(workspaceId, pane.tabId);
			setFocusedPane(pane.tabId, paneId);
		}
		void navigateToV1Workspace(workspaceId, navigate);
		onClose();
	};

	const toggleWorkspace = (workspaceId: string) => {
		setCollapsedWorkspaces((prev) => {
			const next = new Set(prev);
			if (next.has(workspaceId)) {
				next.delete(workspaceId);
			} else {
				next.add(workspaceId);
			}
			return next;
		});
	};

	const toggleProject = (projectId: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	const totalUsage = getTotalUsage(
		normalizedSnapshot?.totalCpu,
		normalizedSnapshot?.totalMemory,
	);

	const trackedMemorySharePercent = normalizedSnapshot
		? getTrackedMemorySharePercent(
				normalizedSnapshot.totalMemory,
				normalizedSnapshot.host.totalMemory,
			)
		: 0;

	const hostShareSeverity = getTrackedHostMemorySeverity(
		trackedMemorySharePercent,
	);
	const shareBarColorClass =
		hostShareSeverity === "high"
			? "bg-destructive/80"
			: hostShareSeverity === "elevated"
				? "bg-amber-500/80"
				: "bg-foreground/40";
	return (
		<PopoverContent align="start" className="w-[28rem] p-0 overflow-hidden">
			<div className="px-3.5 pt-3 pb-3 border-b border-line/60">
				<div className="flex items-center justify-between">
					<h4 className="text-[13px] font-medium tracking-tight text-fg">
						{t("dashboard.resources")}
					</h4>
					<div className="flex items-center gap-0.5">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-fg-mute hover:text-fg hover:bg-foreground/[0.06] transition-colors"
									aria-label={t("dashboard.sortWorkspaces")}
								>
									<HiOutlineBarsArrowDown className="h-3.5 w-3.5" />
									<span>{sortLabels[sortOption]}</span>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuRadioGroup
									value={sortOption}
									onValueChange={(value) => setSortOption(value as SortOption)}
								>
									<DropdownMenuRadioItem value="memory">
										{t("dashboard.sortMemory")}
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="cpu">CPU</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="name">
										{t("dashboard.sortName")}
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="sidebar">
										{t("dashboard.sortSidebar")}
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
						<button
							type="button"
							onClick={() => refetch()}
							className="h-6 w-6 inline-flex items-center justify-center rounded text-fg-mute hover:text-fg hover:bg-foreground/[0.06] transition-colors"
							aria-label={t("dashboard.refreshMetrics")}
						>
							<HiOutlineArrowPath
								className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
							/>
						</button>
					</div>
				</div>

				{normalizedSnapshot && (
					<>
						<div className="mt-3 grid grid-cols-3 divide-x divide-border/50">
							<MetricBadge
								label="CPU"
								value={formatCpu(normalizedSnapshot.totalCpu)}
								tooltip={t("dashboard.cpuTooltip")}
							/>
							<MetricBadge
								label={t("dashboard.sortMemory")}
								value={formatMemory(normalizedSnapshot.totalMemory)}
								tooltip={t("dashboard.memoryTooltip")}
							/>
							<MetricBadge
								label={t("dashboard.ramShare")}
								value={formatPercent(trackedMemorySharePercent)}
								tooltip={t("dashboard.ramShareTooltip")}
							/>
						</div>
						<Tooltip delayDuration={150}>
							<TooltipTrigger asChild>
								<div
									className="mt-3 h-1 w-full overflow-hidden rounded-full bg-hover/60"
									role="progressbar"
									aria-label={t("dashboard.systemRamShare")}
									aria-valuenow={Math.round(trackedMemorySharePercent)}
									aria-valuemin={0}
									aria-valuemax={100}
								>
									<div
										className={cn(
											"h-full rounded-full transition-[width] duration-300",
											shareBarColorClass,
										)}
										style={{
											width: `${Math.min(100, Math.max(0, trackedMemorySharePercent))}%`,
										}}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
								{t("dashboard.ramUsage", {
									percent: formatPercent(trackedMemorySharePercent),
								})}
							</TooltipContent>
						</Tooltip>
					</>
				)}
			</div>

			<div className="max-h-[50vh] overflow-y-auto">
				{normalizedSnapshot && (
					<AppResourceSection
						app={normalizedSnapshot.app}
						totalUsage={totalUsage}
					/>
				)}

				{normalizedSnapshot && (
					<WorkspaceResourceSection
						workspaces={normalizedSnapshot.workspaces}
						sortOption={sortOption}
						sidebarProjectOrder={sidebarProjectOrder}
						sidebarWorkspaceOrder={sidebarWorkspaceOrder}
						collapsedProjects={collapsedProjects}
						toggleProject={toggleProject}
						collapsedWorkspaces={collapsedWorkspaces}
						toggleWorkspace={toggleWorkspace}
						navigateToWorkspace={navigateToWorkspace}
						navigateToPane={navigateToPane}
						getPaneName={getPaneName}
					/>
				)}

				{normalizedSnapshot && normalizedSnapshot.workspaces.length === 0 && (
					<div className="px-3.5 py-6 text-center text-[11px] text-fg-mute">
						{t("dashboard.noActiveTerminals")}
					</div>
				)}

				{!normalizedSnapshot && (
					<div className="px-3.5 py-6 text-center text-[11px] text-fg-mute">
						{t("dashboard.loading")}
					</div>
				)}
			</div>
		</PopoverContent>
	);
}
