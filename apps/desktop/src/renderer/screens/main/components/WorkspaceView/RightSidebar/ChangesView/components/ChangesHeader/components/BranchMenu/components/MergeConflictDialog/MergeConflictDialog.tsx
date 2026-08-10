import {
	AlertDialog,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useTranslation } from "renderer/providers/I18nProvider";

interface MergeConflictDialogProps {
	branch: string | null;
	onOpenChange: (open: boolean) => void;
}

export function MergeConflictDialog({
	branch,
	onOpenChange,
}: MergeConflictDialogProps) {
	const { t } = useTranslation();
	return (
		<AlertDialog open={branch !== null} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pb-2 pt-4">
					<AlertDialogTitle className="font-medium">
						{t("v1Changes.branchMenu.mergeConflictTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("v1Changes.branchMenu.mergeConflictDesc", {
							branch: branch ?? "",
						})}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end px-4 pb-4 pt-2">
					<Button
						variant="secondary"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						{t("v1Changes.branchMenu.mergeConflictClose")}
					</Button>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
