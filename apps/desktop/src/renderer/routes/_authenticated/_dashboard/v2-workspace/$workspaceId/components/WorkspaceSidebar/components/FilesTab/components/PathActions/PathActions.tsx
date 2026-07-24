import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard, Copy, FolderOpen } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface PathActionsProps {
	absolutePath: string;
	relativePath: string;
}

export function PathActions({ absolutePath, relativePath }: PathActionsProps) {
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
