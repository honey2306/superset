import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogProjects } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { SkillsLibraryPage } from "./components/SkillsLibraryPage/SkillsLibraryPage";

/** Reuse /skills next to memory and MCP; don't add a second skills settings page. */
export function GlobalSkillsPage() {
	const { t } = useTranslation();
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const { projects } = useCatalogProjects();
	const [dirty, setDirty] = useState(false);
	const shouldBlock = useCallback(() => dirty, [dirty]);
	const blocker = useBlocker({
		shouldBlockFn: shouldBlock,
		enableBeforeUnload: dirty,
		withResolver: true,
	});
	return (
		<>
			<div className="h-full min-h-0">
				{hostUrl ? (
					<SkillsLibraryPage
						key={hostUrl}
						hostUrl={hostUrl}
						projects={projects.map((project) => ({
							id: project.id,
							name: project.name,
							repoPath: project.repoPath,
						}))}
						onDirtyChange={setDirty}
					/>
				) : (
					<p role="alert" className="p-6 select-text cursor-text">
						{t("skillsUi.unavailable")}
					</p>
				)}
			</div>
			<AlertDialog
				open={blocker.status === "blocked"}
				onOpenChange={(open) => {
					if (!open && blocker.status === "blocked") blocker.reset();
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("skillsUi.discardTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("skillsUi.discardHint")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => blocker.reset?.()}>
							{t("skillsUi.keep")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								// Keep Radix from also firing onOpenChange(false) -> reset()
								// against the same blocked navigation we just approved.
								event.preventDefault();
								blocker.proceed?.();
							}}
						>
							{t("skillsUi.discard")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
