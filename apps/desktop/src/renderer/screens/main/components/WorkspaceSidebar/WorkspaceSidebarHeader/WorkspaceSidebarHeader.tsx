import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuClock3, LuWorkflow } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { STROKE_WIDTH } from "../constants";

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
	const { projects } = useCatalogProjects();
	const { workspaces } = useCatalogWorkspaces();
	const [isTemporaryWorkspacePending, setIsTemporaryWorkspacePending] =
		useState(false);
	const temporaryWorkspace = useMemo(() => {
		const project = projects.find(
			(candidate) => candidate.kind === "temporary",
		);
		if (!project) return null;
		return (
			workspaces.find(
				(workspace) =>
					workspace.projectId === project.id && workspace.type === "main",
			) ?? null
		);
	}, [projects, workspaces]);
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });
	const isTemporaryWorkspaceOpen = workspaceId === temporaryWorkspace?.id;

	const handleAutomationsClick = () => {
		navigate({ to: "/automations" });
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
			if (!operation.workspaceId || operation.state === "failed") {
				throw new Error(
					operation.failure?.message ?? "Workspace provisioning failed",
				);
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
			"flex items-center gap-2 rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
			isCollapsed ? "size-8 justify-center" : "w-full px-2 py-1.5",
			isActive && "bg-accent text-foreground",
		);

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-2 border-b border-border py-2">
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
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 py-2">
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
		</div>
	);
}
