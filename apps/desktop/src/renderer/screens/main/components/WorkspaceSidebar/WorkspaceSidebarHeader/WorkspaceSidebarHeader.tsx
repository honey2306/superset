import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuBrainCircuit,
	LuClock3,
	LuFolderTree,
	LuHistory,
	LuListTodo,
	LuWorkflow,
} from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useTodoAlerts } from "renderer/routes/_local/_dashboard/hooks/useTodoAlerts";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { useWorkspaceSidebarStore } from "renderer/stores";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { STROKE_WIDTH } from "../constants";
import { isTemporaryWorkspaceActive } from "./utils/isTemporaryWorkspaceActive";

interface WorkspaceSidebarHeaderProps {
	isCollapsed?: boolean;
}

/** Top-level navigation for persistent, non-project-specific workspace surfaces. */
export function WorkspaceSidebarHeader({
	isCollapsed = false,
}: WorkspaceSidebarHeaderProps) {
	const { t } = useTranslation();
	const { workspaceId } = useParams({ strict: false });
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const adapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(adapter);
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { projects } = useCatalogProjects();
	const { workspaces } = useCatalogWorkspaces();
	const [isTemporaryWorkspacePending, setIsTemporaryWorkspacePending] =
		useState(false);
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });
	const isTodosOpen = !!matchRoute({ to: "/todos", fuzzy: true });
	const isAgentContextOpen =
		!!matchRoute({ to: "/memories", fuzzy: true }) ||
		!!matchRoute({ to: "/mcp", fuzzy: true }) ||
		!!matchRoute({ to: "/skills", fuzzy: true });
	const isTemporaryWorkspaceOpen = isTemporaryWorkspaceActive(
		workspaceId,
		workspaces,
		projects,
	);

	const { alertCount: todoAlertCount } = useTodoAlerts();
	const hasTodoAlerts = todoAlertCount > 0;

	const isTimelineView = useWorkspaceSidebarStore(
		(state) => state.viewMode === "timeline",
	);
	const toggleViewMode = useWorkspaceSidebarStore(
		(state) => state.toggleViewMode,
	);

	const handleAutomationsClick = () => {
		navigate({ to: "/automations" });
	};

	const handleTodosClick = () => {
		navigate({ to: "/todos" });
	};

	const handleAgentContextClick = () => {
		navigate({ to: "/memories" });
	};

	const handleTemporaryWorkspaceClick = async () => {
		if (!adapter) {
			toast.error("Could not open temporary workspace", {
				description: "Workspace host is not available",
			});
			return;
		}

		setIsTemporaryWorkspacePending(true);
		try {
			const operation = await workspaceLaunch.begin({
				adapter,
				request: {
					idempotencyKey: "temporary-workspace:default",
					project: { kind: "temporary", singletonKey: "default" },
					source: { kind: "main" },
				},
			});
			if (
				!operation.projectId ||
				!operation.workspaceId ||
				operation.state === "failed"
			) {
				throw new Error(
					operation.failure?.message ?? "Workspace provisioning failed",
				);
			}
			ensureWorkspaceInSidebar(operation.workspaceId, operation.projectId);
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: operation.workspaceId },
			});
		} catch (error) {
			toast.error("Could not open temporary workspace", {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setIsTemporaryWorkspacePending(false);
		}
	};

	const itemClassName = (isActive = false) =>
		cn(
			"flex items-center justify-center rounded-ds-3 text-fg-mute transition-colors duration-[120ms] hover:bg-hover hover:text-fg",
			isCollapsed ? "size-8" : "size-7",
			isActive && "bg-accent-tint text-fg",
		);

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-2 border-b border-line py-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							className={itemClassName(isAutomationsOpen)}
							onClick={handleAutomationsClick}
							type="button"
						>
							<LuWorkflow className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">
						{t("workspace.automations")}
					</TooltipContent>
				</Tooltip>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							className={cn(itemClassName(isTodosOpen), "relative")}
							onClick={handleTodosClick}
							type="button"
						>
							<LuListTodo className="size-4" strokeWidth={STROKE_WIDTH} />
							{hasTodoAlerts && <TodoAlertDot />}
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">{t("workspace.todos")}</TooltipContent>
				</Tooltip>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							className={itemClassName(isTemporaryWorkspaceOpen)}
							disabled={isTemporaryWorkspacePending}
							onClick={() => void handleTemporaryWorkspaceClick()}
							type="button"
						>
							<LuClock3 className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">
						{t("workspace.temporaryWorkspace")}
					</TooltipContent>
				</Tooltip>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							className={itemClassName(isAgentContextOpen)}
							onClick={handleAgentContextClick}
							type="button"
						>
							<LuBrainCircuit className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">
						{t("workspace.agentContext")}
					</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="flex shrink-0 gap-1 px-[14px] pt-4 pb-[18px]">
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						className={itemClassName(isAutomationsOpen)}
						onClick={handleAutomationsClick}
						type="button"
						aria-label={t("workspace.automations")}
					>
						<LuWorkflow className="size-4" strokeWidth={STROKE_WIDTH} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{t("workspace.automations")}
				</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						className={cn(itemClassName(isTodosOpen), "relative")}
						onClick={handleTodosClick}
						type="button"
						aria-label={t("workspace.todos")}
					>
						<LuListTodo className="size-4" strokeWidth={STROKE_WIDTH} />
						{hasTodoAlerts && <TodoAlertDot />}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">{t("workspace.todos")}</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						className={itemClassName(isTemporaryWorkspaceOpen)}
						disabled={isTemporaryWorkspacePending}
						onClick={() => void handleTemporaryWorkspaceClick()}
						type="button"
						aria-label={t("workspace.temporaryWorkspace")}
					>
						<LuClock3 className="size-4" strokeWidth={STROKE_WIDTH} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{t("workspace.temporaryWorkspace")}
				</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						className={itemClassName(isAgentContextOpen)}
						onClick={handleAgentContextClick}
						type="button"
						aria-label={t("workspace.agentContext")}
					>
						<LuBrainCircuit className="size-4" strokeWidth={STROKE_WIDTH} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{t("workspace.agentContext")}
				</TooltipContent>
			</Tooltip>

			{/* 视图切换与上面四个导航入口语义不同，用 ml-auto 推到另一端 */}
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						className={cn(itemClassName(), "ml-auto")}
						onClick={toggleViewMode}
						type="button"
						aria-label={
							isTimelineView
								? t("workspace.viewProjects")
								: t("workspace.viewTimeline")
						}
					>
						{isTimelineView ? (
							<LuFolderTree className="size-4" strokeWidth={STROKE_WIDTH} />
						) : (
							<LuHistory className="size-4" strokeWidth={STROKE_WIDTH} />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{isTimelineView
						? t("workspace.viewProjects")
						: t("workspace.viewTimeline")}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

function TodoAlertDot() {
	return (
		<span className="absolute right-0 top-0 flex size-2 -translate-y-0.5 translate-x-0.5">
			<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
			<span className="relative inline-flex size-2 rounded-full bg-destructive" />
		</span>
	);
}
