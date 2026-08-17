import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { LuClock3, LuListTodo, LuSearch, LuWorkflow } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useTodoAlerts } from "renderer/routes/_local/_dashboard/hooks/useTodoAlerts";
import { createEmptyPaneLayout } from "renderer/routes/_local/hooks/useDashboardSidebarState/sidebarMutations";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { STROKE_WIDTH } from "../constants";
import { ConversationSearchDialog } from "./components/ConversationSearchDialog";
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
	const localCollections = useLocalCollections();
	const { projects } = useCatalogProjects();
	const { workspaces } = useCatalogWorkspaces();
	const [isTemporaryWorkspacePending, setIsTemporaryWorkspacePending] =
		useState(false);
	const [isConversationSearchOpen, setIsConversationSearchOpen] =
		useState(false);
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });
	const isTodosOpen = !!matchRoute({ to: "/todos", fuzzy: true });
	const isTemporaryWorkspaceOpen = isTemporaryWorkspaceActive(
		workspaceId,
		workspaces,
		projects,
	);

	const { alertCount: todoAlertCount } = useTodoAlerts();
	const hasTodoAlerts = todoAlertCount > 0;

	const handleAutomationsClick = () => {
		navigate({ to: "/automations" });
	};

	const handleTodosClick = () => {
		navigate({ to: "/todos" });
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
			if (!localCollections.workspaceLocalState.get(operation.workspaceId)) {
				localCollections.workspaceLocalState.insert({
					workspaceId: operation.workspaceId,
					createdAt: new Date(),
					sidebarState: {
						projectId: operation.projectId,
						tabOrder: 0,
						sectionId: null,
						isHidden: true,
					},
					paneLayout: createEmptyPaneLayout(),
				});
			}
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
			"flex items-center gap-2 rounded-ds-3 text-fg-mute transition-colors duration-[120ms] hover:bg-hover hover:text-fg",
			isCollapsed ? "size-8 justify-center" : "w-full px-2 py-1.5",
			isActive && "bg-accent-tint text-fg",
		);

	if (isCollapsed) {
		return (
			<>
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
								aria-label={t("conversationSearch.open")}
								className={itemClassName()}
								onClick={() => setIsConversationSearchOpen(true)}
								type="button"
							>
								<LuSearch className="size-4" strokeWidth={STROKE_WIDTH} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{t("conversationSearch.open")}
						</TooltipContent>
					</Tooltip>
				</div>
				<ConversationSearchDialog
					onOpenChange={setIsConversationSearchOpen}
					open={isConversationSearchOpen}
				/>
			</>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-1 border-b border-line px-2 py-2">
				<button
					className={itemClassName(isAutomationsOpen)}
					onClick={handleAutomationsClick}
					type="button"
				>
					<div className="flex size-5 items-center justify-center">
						<LuWorkflow className="size-4" strokeWidth={STROKE_WIDTH} />
					</div>
					<span className="flex-1 text-left text-sm font-medium">
						{t("workspace.automations")}
					</span>
				</button>
				<button
					className={itemClassName(isTodosOpen)}
					onClick={handleTodosClick}
					type="button"
				>
					<div className="relative flex size-5 items-center justify-center">
						<LuListTodo className="size-4" strokeWidth={STROKE_WIDTH} />
						{hasTodoAlerts && <TodoAlertDot />}
					</div>
					<span className="flex-1 text-left text-sm font-medium">
						{t("workspace.todos")}
					</span>
				</button>
				<button
					className={itemClassName(isTemporaryWorkspaceOpen)}
					disabled={isTemporaryWorkspacePending}
					onClick={() => void handleTemporaryWorkspaceClick()}
					type="button"
				>
					<div className="flex size-5 items-center justify-center">
						<LuClock3 className="size-4" strokeWidth={STROKE_WIDTH} />
					</div>
					<span className="flex-1 text-left text-sm font-medium">
						{t("workspace.temporaryWorkspace")}
					</span>
				</button>
				<button
					className={itemClassName()}
					onClick={() => setIsConversationSearchOpen(true)}
					type="button"
				>
					<div className="flex size-5 items-center justify-center">
						<LuSearch className="size-4" strokeWidth={STROKE_WIDTH} />
					</div>
					<span className="flex-1 text-left text-sm font-medium">
						{t("conversationSearch.open")}
					</span>
				</button>
			</div>
			<ConversationSearchDialog
				onOpenChange={setIsConversationSearchOpen}
				open={isConversationSearchOpen}
			/>
		</>
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
