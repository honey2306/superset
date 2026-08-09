import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute } from "@tanstack/react-router";
import { LuPlus } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { STROKE_WIDTH_THICK } from "../constants";

interface NewWorkspaceButtonProps {
	isCollapsed?: boolean;
}

export function NewWorkspaceButton({
	isCollapsed = false,
}: NewWorkspaceButtonProps) {
	const { t } = useTranslation();
	const openModal = useOpenNewWorkspaceModal();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;

	// Derive current workspace from route to pre-select project in modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId = currentWorkspaceMatch
		? currentWorkspaceMatch.workspaceId
		: null;

	const { workspace: currentWorkspace } =
		useCatalogWorkspace(currentWorkspaceId);

	const handleClick = () => {
		const projectId = currentWorkspace?.projectId;
		openModal(projectId);
	};

	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						className="group flex items-center justify-center size-8 rounded-ds-3 bg-accent/40 hover:bg-accent/60 transition-colors"
					>
						<div className="flex items-center justify-center size-5 rounded bg-accent-tint">
							<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
						</div>
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{t("workspace.new")} ({shortcutText})
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			className="group flex items-center gap-2 px-2 py-1.5 w-full text-sm font-medium text-fg-mute hover:text-fg bg-accent/40 hover:bg-accent/60 rounded-ds-3 transition-colors"
		>
			<div className="flex items-center justify-center size-5 rounded bg-accent-tint">
				<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
			</div>
			<span className="flex-1 text-left">{t("workspace.new")}</span>
			<span className="text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors font-mono tabular-nums shrink-0">
				{shortcutText}
			</span>
		</button>
	);
}
