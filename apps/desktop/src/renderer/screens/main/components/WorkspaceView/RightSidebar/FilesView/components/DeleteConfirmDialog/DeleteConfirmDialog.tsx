import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { DirectoryEntry } from "shared/file-tree-types";

interface DeleteConfirmDialogProps {
	entry: DirectoryEntry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting?: boolean;
}

export function DeleteConfirmDialog({
	entry,
	open,
	onOpenChange,
	onConfirm,
	isDeleting = false,
}: DeleteConfirmDialogProps) {
	const { t } = useTranslation();

	if (!entry) return null;

	const title = entry.isDirectory
		? t("files.deleteFolderTitle", { name: entry.name })
		: t("files.deleteFileTitle", { name: entry.name });
	const description = entry.isDirectory
		? t("files.deleteFolderDescription")
		: t("files.deleteFileDescription");

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
						disabled={isDeleting}
					>
						{isDeleting ? t("common.deleting") : t("common.delete")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
