import type { ExternalApp } from "@superset/shared/desktop-types";
import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuExternalLink, LuSearch, LuTrash2 } from "react-icons/lu";
import { getAppOption } from "renderer/components/OpenInExternalDropdown";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/DeleteWorkspaceDialog/DeleteWorkspaceDialog";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { useTheme } from "renderer/stores/theme";
import supersetEmptyStateWordmark from "./assets/superset-empty-state-wordmark.svg";
import { EmptyTabActionButton } from "./components/EmptyTabActionButton";

interface EmptyTabViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

interface EmptyTabAction {
	id: string;
	label: string;
	display: string[];
	icon: IconType;
	onClick: () => void;
}

export function EmptyTabView({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: EmptyTabViewProps) {
	const { workspaceId } = useParams({
		from: "/_local/_dashboard/workspace/$workspaceId/",
	});
	const activeTheme = useTheme();
	const { t } = useTranslation();

	// Catalog projection is cache-first: returns the row as soon as it's
	// in the local projection (or after the first snapshot install).
	// A brief null while the snapshot hasn't loaded is fine here — the
	// `useTabsWithPresets` hook already tolerates a nullable projectId.
	const { workspace } = useCatalogWorkspace(workspaceId);
	const { addTab } = useTabsWithPresets(workspace?.projectId);
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();

	const { keys: newGroupDisplay } = useHotkeyDisplay("NEW_GROUP");
	const { keys: quickOpenDisplay } = useHotkeyDisplay("QUICK_OPEN");
	const { keys: openInAppDisplay } = useHotkeyDisplay("OPEN_IN_APP");
	const resolvedExternalApp: ExternalApp = defaultExternalApp ?? "cursor";

	const handleShowTerminal = useCallback(() => {
		addTab(workspaceId);
	}, [addTab, workspaceId]);

	const openInActionLabel = useMemo(() => {
		const appOption = getAppOption(resolvedExternalApp);
		const appName = appOption?.displayLabel ?? appOption?.label;
		return appName ? t("workspace.openInApp", { app: appName }) : null;
	}, [resolvedExternalApp, t]);

	const actions = useMemo<EmptyTabAction[]>(() => {
		const baseActions: EmptyTabAction[] = [
			{
				id: "terminal",
				label: t("workspace.openTerminal"),
				display: newGroupDisplay,
				icon: BsTerminalPlus,
				onClick: handleShowTerminal,
			},
		];

		// Browser action removed

		if (openInActionLabel) {
			baseActions.push({
				id: "open-in-app",
				label: openInActionLabel,
				display: openInAppDisplay,
				icon: LuExternalLink,
				onClick: onOpenInApp,
			});
		}

		baseActions.push({
			id: "search-files",
			label: t("workspace.searchFiles"),
			display: quickOpenDisplay,
			icon: LuSearch,
			onClick: onOpenQuickOpen,
		});

		return baseActions;
	}, [
		openInActionLabel,
		onOpenInApp,
		onOpenQuickOpen,
		openInAppDisplay,
		quickOpenDisplay,
		t,
		handleShowTerminal,
		newGroupDisplay,
	]);

	return (
		<div className="flex h-full flex-1 items-center justify-center px-6 py-10">
			<div className="w-full max-w-xl">
				<div className="mb-7 flex items-center justify-center py-3">
					<img
						alt="Superset"
						className={`h-8 w-auto select-none ${
							activeTheme?.type === "dark"
								? "opacity-85"
								: "brightness-0 opacity-75"
						}`}
						draggable={false}
						src={supersetEmptyStateWordmark}
					/>
				</div>
				<div className="mx-auto grid w-full max-w-md gap-0.5">
					{actions.map((action) => (
						<EmptyTabActionButton
							key={action.id}
							display={action.display}
							icon={action.icon}
							label={action.label}
							onClick={action.onClick}
						/>
					))}
				</div>
				{workspace && (
					<button
						type="button"
						className="mx-auto mt-6 flex items-center gap-1 text-xs text-fg-mute/50 transition-colors hover:text-fg-mute"
						onClick={handleDeleteClick}
					>
						<LuTrash2 className="size-3" />
						{t("workspace.deleteAction")}
					</button>
				)}
			</div>
			{workspace && (
				<DeleteWorkspaceDialog
					workspaceId={workspaceId}
					workspaceName={workspace.name}
					// Catalog projection distinguishes main-vs-worktree in
					// host terms; DeleteWorkspaceDialog reasons in v1 shell
					// terms where the project's default branch workspace is
					// called "branch". They're the same thing — map the
					// host `main` label to the v1 `branch` label.
					workspaceType={workspace.type === "main" ? "branch" : "worktree"}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			)}
		</div>
	);
}
