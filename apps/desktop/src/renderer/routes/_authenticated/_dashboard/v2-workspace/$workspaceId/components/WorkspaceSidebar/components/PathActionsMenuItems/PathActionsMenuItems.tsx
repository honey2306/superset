import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard, Copy, FolderOpen } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface PathActionsMenuItemsProps {
	absolutePath: string;
	relativePath?: string;
	menuType?: "context" | "dropdown";
}

export function PathActionsMenuItems({
	absolutePath,
	relativePath,
	menuType = "context",
}: PathActionsMenuItemsProps) {
	const { copyToClipboard } = useCopyToClipboard();
	const { t } = useTranslation();

	const handleCopy = (path: string, successMessage: string) => {
		toast.promise(copyToClipboard(path), {
			success: successMessage,
			error: (err: unknown) =>
				t("v2Workspace.pathActions.copyFailed", {
					error:
						err instanceof Error
							? err.message
							: t("v2Workspace.pathActions.unknownError"),
				}),
		});
	};

	const handleRevealInFinder = async () => {
		try {
			await electronTrpcClient.external.openInFinder.mutate(absolutePath);
		} catch (error) {
			toast.error(
				t("v2Workspace.pathActions.revealFailed", {
					error:
						error instanceof Error
							? error.message
							: t("v2Workspace.pathActions.unknownError"),
				}),
			);
		}
	};

	if (menuType === "dropdown") {
		return (
			<>
				<DropdownMenuItem onSelect={handleRevealInFinder}>
					<FolderOpen />
					{t("v2Workspace.pathActions.revealInFinder")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() =>
						handleCopy(absolutePath, t("v2Workspace.pathActions.pathCopied"))
					}
				>
					<Clipboard />
					{t("v2Workspace.pathActions.copyPath")}
				</DropdownMenuItem>
				{relativePath && (
					<DropdownMenuItem
						onSelect={() =>
							handleCopy(
								relativePath,
								t("v2Workspace.pathActions.relativePathCopied"),
							)
						}
					>
						<Copy />
						{t("v2Workspace.pathActions.copyRelativePath")}
					</DropdownMenuItem>
				)}
			</>
		);
	}

	return (
		<>
			<ContextMenuItem onSelect={handleRevealInFinder}>
				<FolderOpen />
				{t("v2Workspace.pathActions.revealInFinder")}
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem
				onSelect={() =>
					handleCopy(absolutePath, t("v2Workspace.pathActions.pathCopied"))
				}
			>
				<Clipboard />
				{t("v2Workspace.pathActions.copyPath")}
			</ContextMenuItem>
			{relativePath && (
				<ContextMenuItem
					onSelect={() =>
						handleCopy(
							relativePath,
							t("v2Workspace.pathActions.relativePathCopied"),
						)
					}
				>
					<Copy />
					{t("v2Workspace.pathActions.copyRelativePath")}
				</ContextMenuItem>
			)}
		</>
	);
}
