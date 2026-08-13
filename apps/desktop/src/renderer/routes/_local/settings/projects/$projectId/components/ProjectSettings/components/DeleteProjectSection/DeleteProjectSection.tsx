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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface DeleteProjectSectionProps {
	projectId: string;
	projectName: string;
	/** Hosts serving this project — the delete fans out to each. */
	hostIds: string[];
}

export function DeleteProjectSection({
	projectId,
	projectName,
	hostIds,
}: DeleteProjectSectionProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const hostUrls = useHostUrls(hostIds);
	const reachableHosts = hostUrls.filter(
		(host): host is { hostId: string; url: string; isLocal: boolean } =>
			host.url !== null,
	);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (reachableHosts.length === 0) {
			toast.error(t("project.noReachableHost"));
			return;
		}
		setIsDeleting(true);
		try {
			// Projects are local per host — delete on every serving host.
			const results = await Promise.allSettled(
				reachableHosts.map((host) =>
					getHostServiceClientByUrl(host.url).project.remove.mutate({
						projectId,
					}),
				),
			);
			const failed = results.filter((r) => r.status === "rejected");
			if (failed.length === results.length) {
				const first = failed[0] as PromiseRejectedResult;
				throw first.reason instanceof Error
					? first.reason
					: new Error(String(first.reason));
			}
			const skipped = hostIds.length - reachableHosts.length;
			if (failed.length > 0 || skipped > 0) {
				toast.warning(
					t("project.deletedPartial", {
						project: projectName,
						deleted: results.length - failed.length,
						total: hostIds.length,
					}),
				);
			} else {
				toast.success(t("project.deleted", { project: projectName }));
			}
			setIsOpen(false);
			navigate({ to: "/settings/projects" });
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("project.failedDelete"),
			);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{t("project.delete")}</div>
			</div>
			<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
				<AlertDialogTrigger asChild>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						className="shrink-0"
					>
						{t("project.delete")}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("project.deleteTitle", { project: projectName })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("project.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>
							{t("common.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								handleDelete();
							}}
							disabled={isDeleting || reachableHosts.length === 0}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isDeleting ? t("common.deleting") : t("common.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
