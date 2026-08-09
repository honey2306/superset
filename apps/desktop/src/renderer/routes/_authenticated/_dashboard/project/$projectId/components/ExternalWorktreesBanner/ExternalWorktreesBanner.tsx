import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { motion } from "framer-motion";
import { GoGitBranch } from "react-icons/go";
import { useWorkspaceCreationWorktrees } from "renderer/hooks/host-workspaces/useWorkspaceCreationBranches";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useImportAllWorktrees } from "renderer/react-query/workspaces/useImportAllWorktrees";

const MAX_VISIBLE_BRANCHES = 5;

export function ExternalWorktreesBanner({ projectId }: { projectId: string }) {
	const { t } = useTranslation();
	const { worktrees: externalWorktrees, isLoading } =
		useWorkspaceCreationWorktrees(projectId);
	const importableWorktrees = externalWorktrees.filter(
		(worktree) => !worktree.hasActiveWorkspace,
	);

	const importAllWorktrees = useImportAllWorktrees();

	if (isLoading || importableWorktrees.length === 0) {
		return null;
	}

	const handleImportAll = async () => {
		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			toast.success(t("workspace.importedCount", { count: result.imported }));
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("project.failedImportWorktrees"),
			);
		}
	};

	const visibleBranches = importableWorktrees.slice(0, MAX_VISIBLE_BRANCHES);
	const remainingCount = importableWorktrees.length - visibleBranches.length;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 8 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
			className="mx-6 mt-6 rounded-ds-5 border border-line/60 bg-surface/50 p-4"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-2 min-w-0">
					<p className="text-sm font-medium text-fg">
						{t("workspace.existingWorktreesFound", {
							count: importableWorktrees.length,
						})}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{visibleBranches.map((wt) => (
							<span
								key={wt.path}
								className="inline-flex items-center gap-1 rounded-ds-3 bg-hover px-2 py-0.5 text-xs font-mono text-fg-mute"
							>
								<GoGitBranch className="size-3 shrink-0" />
								<span className="truncate max-w-[180px]">{wt.branch}</span>
							</span>
						))}
						{remainingCount > 0 && (
							<span className="inline-flex items-center rounded-ds-3 bg-hover px-2 py-0.5 text-xs text-fg-mute">
								{t("workspace.moreCount", { count: remainingCount })}
							</span>
						)}
					</div>
				</div>

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							className="shrink-0"
							disabled={importAllWorktrees.isPending}
						>
							{importAllWorktrees.isPending
								? t("project.importing")
								: t("project.importAll")}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("project.importAllTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("project.importAllDescription", {
									count: importableWorktrees.length,
								})}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
							<AlertDialogAction onClick={handleImportAll}>
								{t("project.importAll")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</motion.div>
	);
}
