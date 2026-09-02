import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";

interface CreateProjectGroupDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateProjectGroupDialog({
	open,
	onOpenChange,
}: CreateProjectGroupDialogProps) {
	const { t } = useTranslation();
	const { createProjectGroup } = useDashboardSidebarState();
	const [name, setName] = useState("");

	useEffect(() => {
		if (open) setName("");
	}, [open]);

	const handleCreate = () => {
		const trimmedName = name.trim();
		if (!trimmedName) return;
		try {
			createProjectGroup({ name: trimmedName });
			onOpenChange(false);
		} catch (error) {
			toast.error(
				`Failed to create project group: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						{t("workspace.createProjectGroup")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("workspace.projectGroupDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="px-4 py-2">
					<Input
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								handleCreate();
							}
						}}
						placeholder={t("workspace.projectGroupNamePlaceholder")}
					/>
				</div>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant="default"
						size="sm"
						className="h-7 px-3 text-xs"
						disabled={!name.trim()}
						onClick={handleCreate}
					>
						{t("workspace.create")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
