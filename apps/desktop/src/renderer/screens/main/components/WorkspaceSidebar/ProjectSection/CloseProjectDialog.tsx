import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useTranslation } from "renderer/providers/I18nProvider";

interface CloseProjectDialogProps {
	projectName: string;
	workspaceCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function CloseProjectDialog({
	projectName,
	workspaceCount,
	open,
	onOpenChange,
	onConfirm,
}: CloseProjectDialogProps) {
	const { t } = useTranslation();
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						{t("workspace.closeProjectQuestion", { name: projectName })}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-fg-mute space-y-1.5">
							<span className="block">
								{t("workspace.closeProjectWorkspaceCount", {
									count: workspaceCount,
								})}
							</span>
							<span className="block">
								{t("workspace.closeProjectFilesRemain")}
							</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						{t("common.cancel")}
					</Button>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						{t("workspace.closeProject")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
