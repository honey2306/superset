import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useEffect, useState } from "react";
import { LuFolderOpen, LuLoaderCircle } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import {
	beginProjectProvisioning,
	createWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";

type SetupMode = "clone" | "import";

interface SetupProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	projectName?: string;
	hostUrl: string | null;
	hostName: string;
	repoCloneUrl: string | null;
	isRemoteTarget: boolean;
	onChanged?: () => void;
	onConflict: (conflict: { id: string; name: string }) => void;
}

export function SetupProjectModal({
	open,
	onOpenChange,
	projectId,
	projectName,
	hostUrl,
	hostName,
	repoCloneUrl,
	isRemoteTarget,
	onChanged,
	onConflict,
}: SetupProjectModalProps) {
	const { t } = useTranslation();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();

	const [mode, setMode] = useState<SetupMode>(
		repoCloneUrl ? "clone" : "import",
	);
	const [parentDir, setParentDir] = useState("");
	const [importPath, setImportPath] = useState("");
	const [working, setWorking] = useState(false);
	const [browseTarget, setBrowseTarget] = useState<
		"parentDir" | "importPath" | null
	>(null);

	useEffect(() => {
		if (!open) return;
		setMode(repoCloneUrl ? "clone" : "import");
	}, [open, repoCloneUrl]);

	const reset = () => {
		setParentDir("");
		setImportPath("");
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const browseFor = async (
		title: string,
		target: "parentDir" | "importPath",
	) => {
		try {
			const result = await selectDirectory.mutateAsync({ title });
			if (result.canceled || !result.path) return;
			if (target === "parentDir") setParentDir(result.path);
			else setImportPath(result.path);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		}
	};

	const runClone = async () => {
		if (!hostUrl) {
			toast.error(t("project.hostUnavailable", { host: hostName }));
			return;
		}
		const trimmed = parentDir.trim();
		if (!trimmed) {
			toast.error(
				isRemoteTarget
					? t("project.enterParentDirectory", { host: hostName })
					: t("project.pickParentDirectory"),
			);
			return;
		}
		setWorking(true);
		try {
			const result = await beginProjectProvisioning({
				hostUrl,
				adapter: createWorkspaceProvisioningAdapter(hostUrl),
				request: {
					idempotencyKey: `project-setup:${projectId}:clone:${trimmed}`,
					project: {
						kind: "setup-existing",
						projectId,
						origin: { repoUrl: repoCloneUrl ?? undefined, name: projectName },
						mode: { kind: "clone", parentDirectory: trimmed },
					},
					source: { kind: "main" },
				},
			});
			toast.success(t("project.clonedTo", { path: result.repoPath }));
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setWorking(false);
		}
	};

	const runImport = async () => {
		if (!hostUrl) {
			toast.error(t("project.hostUnavailable", { host: hostName }));
			return;
		}
		const trimmed = importPath.trim();
		if (!trimmed) {
			toast.error(
				isRemoteTarget
					? t("project.enterPath", { host: hostName })
					: t("project.pickProjectLocation"),
			);
			return;
		}
		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const precheck = await client.project.findBackfillConflict.query({
				projectId,
				repoPath: trimmed,
			});
			if (precheck.conflict) {
				onConflict(precheck.conflict);
				onOpenChange(false);
				return;
			}
			const result = await beginProjectProvisioning({
				hostUrl,
				adapter: createWorkspaceProvisioningAdapter(hostUrl),
				request: {
					idempotencyKey: `project-setup:${projectId}:import:${trimmed}`,
					project: {
						kind: "setup-existing",
						projectId,
						origin: { repoUrl: repoCloneUrl ?? undefined, name: projectName },
						mode: { kind: "import", path: trimmed, allowRelocate: false },
					},
					source: { kind: "main" },
				},
			});
			toast.success(t("project.setUpAt", { path: result.repoPath }));
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setWorking(false);
		}
	};

	const submit = mode === "clone" ? runClone : runImport;
	const submitLabel =
		mode === "clone" ? t("project.clone") : t("project.import");
	const cloneDisabled = !repoCloneUrl;

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange} modal>
				<DialogContent className="max-w-[480px]">
					<DialogHeader>
						<DialogTitle>
							{t("project.setupTitle", { host: hostName })}
						</DialogTitle>
						<DialogDescription>
							{t("project.setupDescription")}
						</DialogDescription>
					</DialogHeader>

					<Tabs
						value={mode}
						onValueChange={(value) => setMode(value as SetupMode)}
					>
						<TabsList className="w-full">
							<TabsTrigger
								value="clone"
								disabled={cloneDisabled}
								className="flex-1"
							>
								{t("project.clone")}
							</TabsTrigger>
							<TabsTrigger value="import" className="flex-1">
								{t("project.importExisting")}
							</TabsTrigger>
						</TabsList>

						<TabsContent value="clone" className="mt-4 space-y-3">
							{cloneDisabled ? (
								<p className="text-sm text-fg-mute">
									{t("project.cloneRequiresRepository")}
								</p>
							) : (
								<>
									{repoCloneUrl && (
										<div className="flex flex-col gap-1">
											<Label className="text-xs">
												{t("project.repository")}
											</Label>
											<p className="font-mono text-xs text-fg-mute select-text cursor-text break-all">
												{repoCloneUrl}
											</p>
										</div>
									)}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="setup-parent-dir" className="text-xs">
											{isRemoteTarget
												? t("project.parentDirectoryOnHost", { host: hostName })
												: t("project.parentDirectory")}
										</Label>
										<div className="flex gap-1.5">
											<Input
												id="setup-parent-dir"
												value={parentDir}
												onChange={(e) => setParentDir(e.target.value)}
												placeholder={
													isRemoteTarget
														? "/home/user/projects"
														: t("project.pickFolder")
												}
												disabled={working}
												className="flex-1 font-mono text-sm"
												onKeyDown={(e) => {
													if (e.key === "Enter" && !working) void runClone();
												}}
											/>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => {
													if (isRemoteTarget) {
														setBrowseTarget("parentDir");
													} else {
														void browseFor(
															t("project.selectParentDirectory"),
															"parentDir",
														);
													}
												}}
												disabled={working || selectDirectory.isPending}
												className="shrink-0"
												aria-label={t("project.browseDirectory")}
											>
												<LuFolderOpen className="size-4" />
											</Button>
										</div>
									</div>
								</>
							)}
						</TabsContent>

						<TabsContent value="import" className="mt-4 space-y-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-import-path" className="text-xs">
									{isRemoteTarget
										? t("project.existingRepoPathOnHost", { host: hostName })
										: t("project.existingRepoPath")}
								</Label>
								<div className="flex gap-1.5">
									<Input
										id="setup-import-path"
										value={importPath}
										onChange={(e) => setImportPath(e.target.value)}
										placeholder={
											isRemoteTarget
												? "/home/user/projects/my-repo"
												: t("project.pickFolder")
										}
										disabled={working}
										className="flex-1 font-mono text-sm"
										onKeyDown={(e) => {
											if (e.key === "Enter" && !working) void runImport();
										}}
									/>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => {
											if (isRemoteTarget) {
												setBrowseTarget("importPath");
											} else {
												void browseFor(
													t("project.pickProjectLocation"),
													"importPath",
												);
											}
										}}
										disabled={working || selectDirectory.isPending}
										className="shrink-0"
										aria-label={t("project.browseDirectory")}
									>
										<LuFolderOpen className="size-4" />
									</Button>
								</div>
							</div>
						</TabsContent>
					</Tabs>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							onClick={() => void submit()}
							disabled={
								working || !hostUrl || (mode === "clone" && cloneDisabled)
							}
						>
							{working ? (
								<>
									<LuLoaderCircle className="size-4 animate-spin" />
									{submitLabel}…
								</>
							) : (
								submitLabel
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<RemotePathPicker
				open={browseTarget !== null}
				onOpenChange={(next) => {
					if (!next) setBrowseTarget(null);
				}}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={
					browseTarget === "parentDir"
						? parentDir || undefined
						: browseTarget === "importPath"
							? importPath || undefined
							: undefined
				}
				title={
					browseTarget === "parentDir"
						? t("project.chooseParentDirectory")
						: t("project.chooseExistingRepo")
				}
				confirmLabel={
					browseTarget === "parentDir"
						? t("project.useFolder")
						: t("project.useRepo")
				}
				onPick={(path) => {
					if (browseTarget === "parentDir") setParentDir(path);
					else if (browseTarget === "importPath") setImportPath(path);
				}}
			/>
		</>
	);
}
