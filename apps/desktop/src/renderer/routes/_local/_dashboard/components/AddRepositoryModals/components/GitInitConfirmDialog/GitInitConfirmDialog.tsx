import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { getBaseName } from "renderer/lib/pathBasename";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useGitInitConfirmStore } from "renderer/stores/git-init-confirm";

/**
 * Confirms initializing git in a folder the user picked to import that isn't a
 * git repo yet. Driven imperatively by `useGitInitConfirmStore.request()` from
 * the folder-first import flow; mounted once via AddRepositoryModals.
 */
export function GitInitConfirmDialog() {
	const { t } = useTranslation();
	const isOpen = useGitInitConfirmStore((s) => s.isOpen);
	const repoPath = useGitInitConfirmStore((s) => s.repoPath);
	const resolve = useGitInitConfirmStore((s) => s.resolve);

	const folderName = repoPath ? getBaseName(repoPath) : t("project.thisFolder");

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) resolve(false);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("project.initializeGitTitle")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("project.initializeGitDescription", { folder: folderName })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="outline" onClick={() => resolve(false)}>
						{t("common.cancel")}
					</Button>
					<Button onClick={() => resolve(true)}>
						{t("project.initializeAndImport")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
