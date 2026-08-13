import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuFolderOpen, LuRotateCcw } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

interface WorktreeLocationPickerProps {
	currentPath: string | null | undefined;
	fallbackPath: string | null | undefined;
	hostUrl: string | null;
	disabled?: boolean;
	browseTitle?: string;
	onSelect: (path: string) => void | Promise<void>;
	onReset: () => void | Promise<void>;
}

export function WorktreeLocationPicker({
	currentPath,
	fallbackPath,
	hostUrl,
	disabled,
	browseTitle,
	onSelect,
	onReset,
}: WorktreeLocationPickerProps) {
	const { t } = useTranslation();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const displayPath = currentPath ?? fallbackPath ?? t("path.hostUnavailable");
	const isBusy = disabled || selectDirectory.isPending;

	const handleBrowse = async () => {
		if (isBusy) return;
		const result = await selectDirectory.mutateAsync({
			title: browseTitle ?? t("path.selectWorktree"),
			defaultPath: currentPath ?? fallbackPath ?? undefined,
		});
		if (!result.canceled && result.path) {
			await onSelect(result.path);
		}
	};

	return (
		<div className="flex w-[28rem] max-w-full items-center gap-2">
			<div className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-ds-3 border bg-transparent px-3 dark:bg-input/30">
				<span className="font-mono text-sm text-fg" title={displayPath}>
					{displayPath}
				</span>
			</div>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-9 shrink-0"
						onClick={handleBrowse}
						disabled={isBusy || !hostUrl}
						aria-label={t("path.changeWorktree")}
					>
						<LuFolderOpen className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t("path.changeLocation")}</TooltipContent>
			</Tooltip>
			{currentPath ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-9 shrink-0"
							onClick={onReset}
							disabled={disabled}
							aria-label={t("path.resetWorktree")}
						>
							<LuRotateCcw className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t("path.resetLocation")}</TooltipContent>
				</Tooltip>
			) : null}
		</div>
	);
}
