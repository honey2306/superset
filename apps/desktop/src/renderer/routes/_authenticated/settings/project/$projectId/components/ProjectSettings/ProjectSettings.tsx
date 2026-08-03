import type { BranchPrefixMode } from "@superset/local-db";
import {
	resolveBranchPrefix,
	sanitizeSegment,
} from "@superset/shared/workspace-launch";
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
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import {
	useWorkspaceCreationBranches,
	useWorkspaceCreationWorktrees,
} from "renderer/hooks/host-workspaces/useWorkspaceCreationBranches";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useImportAllWorktrees,
	useOpenExternalWorktree,
} from "renderer/react-query/workspaces";
import { ClickablePath } from "../../../../components/ClickablePath";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "../../../../components/WorktreeLocationPicker";
import { BRANCH_PREFIX_MODE_LABEL_KEYS_WITH_DEFAULT } from "../../../../utils/branch-prefix";
import type { SettingItemId } from "../../../../utils/settings-search";
import {
	isItemVisible,
	SETTING_ITEM_ID,
} from "../../../../utils/settings-search";
import { ProjectSettingsHeader } from "../ProjectSettingsHeader";
import { ScriptsEditor } from "./components/ScriptsEditor";

const REPO_DEFAULT_BASE_BRANCH = "__repo_default__";

export function SettingsSection({
	icon,
	title,
	description,
	children,
}: {
	icon?: ReactNode;
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div>
				<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
					{icon}
					{title}
				</h3>
				{description && (
					<p className="text-sm text-muted-foreground mt-0.5">{description}</p>
				)}
			</div>
			{children}
		</div>
	);
}

interface ProjectSettingsProps {
	projectId: string;
	visibleItems?: SettingItemId[] | null;
}

export function ProjectSettings({
	projectId,
	visibleItems,
}: ProjectSettingsProps) {
	const { t } = useTranslation();
	const utils = electronTrpc.useUtils();
	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const {
		branches,
		defaultBranch,
		isLoading: isBranchDataLoading,
	} = useWorkspaceCreationBranches(projectId);
	const branchData = useMemo(
		() => ({ branches, defaultBranch: defaultBranch ?? "" }),
		[branches, defaultBranch],
	);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery({
		id: projectId,
	});
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		project?.branchPrefixCustom ?? "",
	);
	const [selectedWorktreePath, setSelectedWorktreePath] = useState<
		string | null
	>(null);

	useEffect(() => {
		setCustomPrefixInput(project?.branchPrefixCustom ?? "");
	}, [project?.branchPrefixCustom]);

	const updateProject = electronTrpc.projects.update.useMutation({
		onError: (err) => {
			console.error("[project-settings/update] Failed to update:", err);
		},
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const setProjectIcon = electronTrpc.projects.setProjectIcon.useMutation({
		onError: (err) => {
			console.error("[project-settings/setProjectIcon] Failed:", err);
			toast.error(err.message || t("project.failedUpdateIcon"));
		},
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleIconUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				setProjectIcon.mutate({ id: projectId, icon: dataUrl });
			};
			reader.readAsDataURL(file);

			// Reset input so the same file can be re-selected
			e.target.value = "";
		},
		[projectId, setProjectIcon],
	);

	const handleRemoveIcon = useCallback(() => {
		setProjectIcon.mutate({ id: projectId, icon: null });
	}, [projectId, setProjectIcon]);

	const handleBranchPrefixModeChange = (value: string) => {
		if (value === "default") {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: null,
					branchPrefixCustom: customPrefixInput || null,
				},
			});
		} else {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: value as BranchPrefixMode,
					branchPrefixCustom: customPrefixInput || null,
				},
			});
		}
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		updateProject.mutate({
			id: projectId,
			patch: {
				branchPrefixMode: "custom",
				branchPrefixCustom: sanitized || null,
			},
		});
	};

	const handleWorkspaceBaseBranchChange = (value: string) => {
		updateProject.mutate({
			id: projectId,
			patch: {
				workspaceBaseBranch: value === REPO_DEFAULT_BASE_BRANCH ? null : value,
			},
		});
	};

	const { data: globalWorktreeBaseDir } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery();
	const defaultWorktreePath = useDefaultWorktreePath();
	const globalPath = globalWorktreeBaseDir ?? defaultWorktreePath;

	const { worktrees: externalWorktrees, isLoading: isExternalLoading } =
		useWorkspaceCreationWorktrees(projectId);
	const importableExternalWorktrees = externalWorktrees.filter(
		(worktree) => !worktree.hasActiveWorkspace,
	);
	const importAllWorktrees = useImportAllWorktrees();
	const openExternalWorktree = useOpenExternalWorktree();

	const handleImportAll = async () => {
		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			toast.success(t("project.importedCount", { count: result.imported }));
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("project.failedImportWorktrees"),
			);
		}
	};

	const handleImportWorktree = async (path: string, branch: string) => {
		toast.promise(
			openExternalWorktree.mutateAsync({
				projectId,
				worktreePath: path,
			}),
			{
				loading: t("project.importing"),
				success: t("project.importedBranch", { branch }),
				error: (err) =>
					err instanceof Error
						? err.message
						: t("project.failedImportWorktree"),
			},
		);
	};

	const getPreviewPrefix = (
		mode: BranchPrefixMode | "default",
	): string | null => {
		if (mode === "default") {
			return getPreviewPrefix(globalBranchPrefix?.mode ?? "none");
		}
		return (
			resolveBranchPrefix({
				mode,
				customPrefix: customPrefixInput,
				authorPrefix: gitAuthor?.prefix,
				githubUsername: gitInfo?.githubUsername,
			}) ||
			(mode === "author"
				? "author-name"
				: mode === "github"
					? "username"
					: null)
		);
	};

	if (!project) {
		return null;
	}

	const currentMode = project.branchPrefixMode ?? "default";
	const previewPrefix = getPreviewPrefix(currentMode);
	const repoDefaultBranch =
		branchData?.defaultBranch ?? project.defaultBranch ?? "main";
	const workspaceBaseBranchValue =
		project.workspaceBaseBranch ?? REPO_DEFAULT_BASE_BRANCH;
	const workspaceBaseBranchMissing =
		!isBranchDataLoading &&
		!!project.workspaceBaseBranch &&
		!!branchData &&
		!branchData.branches.some(
			(branch) => branch.name === project.workspaceBaseBranch,
		);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<ProjectSettingsHeader title={project.name}>
				<ClickablePath
					path={project.mainRepoPath}
					className="text-xs text-muted-foreground"
				/>
			</ProjectSettingsHeader>

			<div className="space-y-8">
				<SettingsSection
					title={t("project.branchPrefix")}
					description={t("project.preview", {
						value: previewPrefix
							? `${previewPrefix}/branch-name`
							: "branch-name",
					})}
				>
					<div className="flex items-center justify-end">
						<div className="flex items-center gap-2">
							<Select
								value={currentMode}
								onValueChange={handleBranchPrefixModeChange}
								disabled={updateProject.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(
											BRANCH_PREFIX_MODE_LABEL_KEYS_WITH_DEFAULT,
										) as [
											BranchPrefixMode | "default",
											(typeof BRANCH_PREFIX_MODE_LABEL_KEYS_WITH_DEFAULT)[
												| BranchPrefixMode
												| "default"],
										][]
									).map(([value, labelKey]) => (
										<SelectItem key={value} value={value}>
											{t(labelKey)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{currentMode === "custom" && (
								<Input
									placeholder={t("project.prefixPlaceholder")}
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={updateProject.isPending}
								/>
							)}
						</div>
					</div>
				</SettingsSection>

				<SettingsSection
					title={t("project.baseBranch")}
					description={t("project.baseBranchDescription")}
				>
					<div className="flex items-center justify-end gap-4">
						<Select
							value={workspaceBaseBranchValue}
							onValueChange={handleWorkspaceBaseBranchChange}
							disabled={updateProject.isPending || isBranchDataLoading}
						>
							<SelectTrigger className="w-[260px]">
								{isBranchDataLoading ? (
									<span className="text-muted-foreground">
										{t("project.loading")}
									</span>
								) : (
									<SelectValue />
								)}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={REPO_DEFAULT_BASE_BRANCH}>
									{t("project.useRepositoryDefault", {
										branch: repoDefaultBranch,
									})}
								</SelectItem>
								{workspaceBaseBranchMissing && project.workspaceBaseBranch && (
									<SelectItem value={project.workspaceBaseBranch}>
										{project.workspaceBaseBranch} ({t("project.missing")})
									</SelectItem>
								)}
								{(branchData?.branches ?? []).map((branch) => (
									<SelectItem key={branch.name} value={branch.name}>
										{branch.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{workspaceBaseBranchMissing && (
						<p className="text-xs text-destructive">
							{t("project.missingBranch", {
								branch: project.workspaceBaseBranch ?? "",
								fallback: repoDefaultBranch,
							})}
						</p>
					)}
				</SettingsSection>

				<SettingsSection title={t("project.worktrees")}>
					<WorktreeLocationPicker
						currentPath={project.worktreeBaseDir}
						defaultPathLabel={t("project.usingGlobalDefault", {
							path: globalPath,
						})}
						dialogTitle={t("project.selectWorktreeLocation")}
						defaultBrowsePath={project.worktreeBaseDir ?? globalWorktreeBaseDir}
						disabled={updateProject.isPending}
						onSelect={(path) =>
							updateProject.mutate({
								id: projectId,
								patch: { worktreeBaseDir: path },
							})
						}
						onReset={() =>
							updateProject.mutate({
								id: projectId,
								patch: { worktreeBaseDir: null },
							})
						}
					/>

					{!isExternalLoading &&
						importableExternalWorktrees.length > 0 &&
						isItemVisible(
							SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES,
							visibleItems,
						) && (
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label className="text-sm font-medium">
										{t("project.importWorktrees")}
									</Label>
									<p className="text-xs text-muted-foreground">
										{t("project.externalWorktreesFound", {
											count: importableExternalWorktrees.length,
										})}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Select
										value={selectedWorktreePath ?? "__all__"}
										onValueChange={(value) =>
											setSelectedWorktreePath(
												value === "__all__" ? null : value,
											)
										}
									>
										<SelectTrigger className="w-[220px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__all__">
												{t("project.allWorktrees", {
													count: importableExternalWorktrees.length,
												})}
											</SelectItem>
											{importableExternalWorktrees.map((wt) => (
												<SelectItem key={wt.path} value={wt.path}>
													{wt.branch}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectedWorktreePath ? (
										<Button
											size="sm"
											className="w-22"
											disabled={openExternalWorktree.isPending}
											onClick={() => {
												const wt = importableExternalWorktrees.find(
													(w) => w.path === selectedWorktreePath,
												);
												if (wt) {
													handleImportWorktree(wt.path, wt.branch);
													setSelectedWorktreePath(null);
												}
											}}
										>
											{openExternalWorktree.isPending
												? t("project.importing")
												: t("project.import")}
										</Button>
									) : (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													size="sm"
													className="w-22"
													disabled={importAllWorktrees.isPending}
												>
													{importAllWorktrees.isPending
														? t("project.importing")
														: t("project.importAll")}
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														{t("project.importAllTitle")}
													</AlertDialogTitle>
													<AlertDialogDescription>
														{t("project.importAllDescription", {
															count: importableExternalWorktrees.length,
														})}
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>
														{t("common.cancel")}
													</AlertDialogCancel>
													<AlertDialogAction onClick={handleImportAll}>
														{t("project.importAll")}
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									)}
								</div>
							</div>
						)}
				</SettingsSection>

				{isItemVisible(SETTING_ITEM_ID.PROJECT_SCRIPTS, visibleItems) && (
					<ScriptsEditor projectId={project.id} />
				)}

				<SettingsSection title={t("project.appearance")}>
					<div className="flex items-center justify-between gap-4">
						<ColorSelector
							selectedColor={project.color}
							onSelectColor={(color) =>
								updateProject.mutate({
									id: projectId,
									patch: { color },
								})
							}
						/>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								{project.iconUrl && (
									<img
										src={project.iconUrl}
										alt={t("project.iconAlt")}
										className="size-8 rounded object-cover border"
									/>
								)}
								<input
									ref={fileInputRef}
									type="file"
									accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
									className="hidden"
									onChange={handleFileChange}
								/>
								<button
									type="button"
									onClick={handleIconUpload}
									disabled={setProjectIcon.isPending}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border",
										"hover:bg-muted transition-colors",
									)}
								>
									<LuImagePlus className="size-4" />
									{project.iconUrl
										? t("project.replaceIcon")
										: t("project.uploadIcon")}
								</button>
								{project.iconUrl && (
									<button
										type="button"
										onClick={handleRemoveIcon}
										disabled={setProjectIcon.isPending}
										className={cn(
											"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border",
											"hover:bg-destructive/10 text-destructive transition-colors",
										)}
									>
										<LuTrash2 className="size-4" />
										{t("common.remove")}
									</button>
								)}
							</div>
							<div className="flex items-center gap-2">
								<Label className="text-sm text-muted-foreground">
									{t("project.hideImage")}
								</Label>
								<Switch
									checked={project.hideImage ?? false}
									onCheckedChange={(checked) =>
										updateProject.mutate({
											id: projectId,
											patch: { hideImage: checked },
										})
									}
								/>
							</div>
						</div>
					</div>
				</SettingsSection>
			</div>
		</div>
	);
}
