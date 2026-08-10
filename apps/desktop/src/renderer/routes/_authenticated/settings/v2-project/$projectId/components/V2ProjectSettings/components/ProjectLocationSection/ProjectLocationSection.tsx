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
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuFolderOpen } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import {
	beginProjectProvisioning,
	createWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { ClickablePath } from "../../../../../../components/ClickablePath";
import { SetupProjectModal } from "../SetupProjectModal";

interface BackfillConflict {
	id: string;
	name: string;
}

interface ProjectLocationSectionProps {
	projectId: string;
	projectName?: string;
	currentPath: string | null;
	repoCloneUrl: string | null;
	hostId: string | null;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged?: () => void;
}

export function ProjectLocationSection({
	projectId,
	projectName,
	currentPath,
	repoCloneUrl,
	hostId,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: ProjectLocationSectionProps) {
	const { t } = useTranslation();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const navigate = useNavigate();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();

	const [pendingPath, setPendingPath] = useState<string | null>(null);
	const [conflict, setConflict] = useState<BackfillConflict | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [setupOpen, setSetupOpen] = useState(false);
	const [changeBrowseOpen, setChangeBrowseOpen] = useState(false);

	const pickPath = async (title: string) => {
		if (!hostUrl) {
			toast.error(t("project.hostUnavailable", { host: hostName }));
			return null;
		}
		try {
			const picked = await selectDirectory.mutateAsync({
				title,
				defaultPath: currentPath ?? undefined,
			});
			if (picked.canceled || !picked.path) return null;
			return picked.path;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
			return null;
		}
	};

	const proposeRelocate = async (path: string) => {
		if (path === currentPath) {
			toast.info(t("project.alreadyAtLocation"));
			return;
		}
		if (!hostUrl) {
			toast.error(t("project.hostUnavailable", { host: hostName }));
			return;
		}
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const precheck = await client.project.findBackfillConflict.query({
				projectId,
				repoPath: path,
			});
			if (precheck.conflict) {
				setConflict(precheck.conflict);
				return;
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
			return;
		}
		setPendingPath(path);
	};

	const handleChange = async () => {
		if (isRemoteTarget) {
			setChangeBrowseOpen(true);
			return;
		}
		const path = await pickPath(t("project.selectNewLocation"));
		if (!path) return;
		await proposeRelocate(path);
	};

	const handleConfirmRelocate = async () => {
		if (!pendingPath) return;
		if (!hostUrl) {
			toast.error(t("project.hostUnavailable", { host: hostName }));
			return;
		}
		setIsSubmitting(true);
		try {
			const result = await beginProjectProvisioning({
				hostUrl,
				adapter: createWorkspaceProvisioningAdapter(hostUrl),
				request: {
					idempotencyKey: `project-relocate:${projectId}:${pendingPath}`,
					project: {
						kind: "setup-existing",
						projectId,
						origin: { name: projectName },
						mode: {
							kind: "import",
							path: pendingPath,
							allowRelocate: true,
						},
					},
					source: { kind: "main" },
				},
			});
			toast.success(t("project.relocated", { path: result.repoPath }));
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			setPendingPath(null);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			{currentPath ? (
				<div className="flex w-[28rem] max-w-full items-center gap-2">
					<div className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-ds-3 border bg-transparent px-3 dark:bg-input/30">
						<ClickablePath path={currentPath} className="max-w-none shrink-0" />
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-9 shrink-0"
								onClick={handleChange}
								disabled={selectDirectory.isPending || isSubmitting}
								aria-label={t("project.changeLocation")}
							>
								<LuFolderOpen className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t("project.changeLocation")}</TooltipContent>
					</Tooltip>
				</div>
			) : (
				<div className="flex items-center gap-3">
					<span className="text-sm text-fg-mute">
						{t("project.notSetUp", { host: hostName })}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setSetupOpen(true)}
						disabled={!hostUrl}
					>
						{t("project.setup")}
					</Button>
				</div>
			)}

			<SetupProjectModal
				open={setupOpen}
				onOpenChange={setSetupOpen}
				projectId={projectId}
				projectName={projectName}
				hostUrl={hostUrl}
				hostName={hostName}
				repoCloneUrl={repoCloneUrl}
				isRemoteTarget={isRemoteTarget}
				onChanged={onChanged}
				onConflict={setConflict}
			/>

			<RemotePathPicker
				open={changeBrowseOpen}
				onOpenChange={setChangeBrowseOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={currentPath ?? undefined}
				title={t("project.changeLocationTitle")}
				description={t("project.pickNewFolder", { host: hostName })}
				confirmLabel={t("project.useFolder")}
				onPick={(path) => {
					void proposeRelocate(path);
				}}
			/>

			<AlertDialog
				open={conflict !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConflict(null);
						setIsSubmitting(false);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("project.repositoryLinked")}</AlertDialogTitle>
						<AlertDialogDescription className="select-text cursor-text">
							{t("project.repositoryLinkedDescription", {
								project: conflict?.name ?? "",
								host: hostName,
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								if (!conflict) return;
								const target = conflict;
								setConflict(null);
								setIsSubmitting(false);
								navigate({
									to: "/settings/projects/$projectId",
									params: { projectId: target.id },
									search: { hostId: hostId ?? undefined },
								});
							}}
						>
							{t("project.openProject")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={pendingPath !== null}
				onOpenChange={(open) => {
					if (!open && !isSubmitting) setPendingPath(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("project.relocateTitle")}</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-3 text-sm select-text cursor-text">
								<div>
									<div className="text-fg-mute text-xs">
										{t("project.from")}
									</div>
									<div className="font-mono break-all">{currentPath}</div>
								</div>
								<div>
									<div className="text-fg-mute text-xs">{t("project.to")}</div>
									<div className="font-mono break-all">{pendingPath}</div>
								</div>
								<p className="text-fg-mute">{t("project.relocateWarning")}</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isSubmitting}>
							{t("common.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								handleConfirmRelocate();
							}}
							disabled={isSubmitting}
						>
							{isSubmitting ? t("project.relocating") : t("project.relocate")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
