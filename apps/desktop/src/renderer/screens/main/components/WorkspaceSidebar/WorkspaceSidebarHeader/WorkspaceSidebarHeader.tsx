import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { LuClock3, LuWorkflow } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { runV1Migration } from "renderer/lib/v1-migration";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { STROKE_WIDTH } from "../constants";

interface WorkspaceSidebarHeaderProps {
	isCollapsed?: boolean;
}

/** Top-level navigation for persistent, non-project-specific workspace surfaces. */
export function WorkspaceSidebarHeader({
	isCollapsed = false,
}: WorkspaceSidebarHeaderProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const utils = electronTrpc.useUtils();
	const { activeHostUrl, activeOrganizationId } = useLocalHostService();
	const ensureTemporaryWorkspace =
		electronTrpc.projects.ensureTemporaryWorkspace.useMutation();
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });

	const handleAutomationsClick = () => {
		navigate({ to: "/automations" });
	};

	const handleTemporaryWorkspaceClick = async () => {
		try {
			const temporary = await ensureTemporaryWorkspace.mutateAsync();
			if (!activeHostUrl || !activeOrganizationId) {
				throw new Error("Terminal service is not ready yet");
			}
			await runV1Migration({
				organizationId: activeOrganizationId,
				hostClient: getHostServiceClientByUrl(activeHostUrl),
			});
			await utils.workspaces.getAllGrouped.invalidate();
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: temporary.workspaceId },
			});
		} catch (error) {
			toast.error("Could not open temporary workspace", {
				description: error instanceof Error ? error.message : String(error),
			});
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
					<TooltipContent side="right">Automations</TooltipContent>
				</Tooltip>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							className={itemClassName()}
							disabled={ensureTemporaryWorkspace.isPending}
							onClick={() => void handleTemporaryWorkspaceClick()}
							type="button"
						>
							<LuClock3 className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Temporary workspace</TooltipContent>
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
					Automations
				</span>
			</button>
			<button
				className={itemClassName()}
				disabled={ensureTemporaryWorkspace.isPending}
				onClick={() => void handleTemporaryWorkspaceClick()}
				type="button"
			>
				<div className="flex size-5 items-center justify-center">
					<LuClock3 className="size-4" strokeWidth={STROKE_WIDTH} />
				</div>
				<span className="flex-1 text-left text-sm font-medium">
					Temporary workspace
				</span>
			</button>
		</div>
	);
}
