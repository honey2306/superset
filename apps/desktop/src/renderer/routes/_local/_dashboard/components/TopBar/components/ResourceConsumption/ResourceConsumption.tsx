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
import { useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineBarsArrowDown,
	HiOutlineCpuChip,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useRenderStressInstrumentation } from "renderer/lib/performance/stress-instrumentation";
import { useTranslation } from "renderer/providers/I18nProvider";
import { AppResourceSection } from "./components/AppResourceSection";
import { MetricBadge } from "./components/MetricBadge";
import { WorkspaceResourceSection } from "./components/WorkspaceResourceSection";
import { useResourceNavigation } from "./hooks/useResourceNavigation";
import { useResourceSnapshot } from "./hooks/useResourceSnapshot";
import type { SortOption, UsageValues } from "./types";
import { formatCpu, formatMemory, formatPercent } from "./utils/formatters";
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

	useRenderStressInstrumentation("ResourceConsumptionContent", {
		warnAt: 25,
	});

	const {
		snapshot: normalizedSnapshot,
		refetch,
		isFetching,
		sidebarProjectOrder,
		sidebarWorkspaceOrder,
	} = useResourceSnapshot();
	const { getPaneName, navigateToWorkspace, navigateToPane } =
		useResourceNavigation({ onNavigate: onClose });

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
				? "bg-warning/80"
				: "bg-fg/40";
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
									className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-fg-mute hover:text-fg hover:bg-hover transition-colors"
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
							className="h-6 w-6 inline-flex items-center justify-center rounded text-fg-mute hover:text-fg hover:bg-hover transition-colors"
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
						<div className="mt-3 grid grid-cols-3 divide-x divide-line/50">
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
