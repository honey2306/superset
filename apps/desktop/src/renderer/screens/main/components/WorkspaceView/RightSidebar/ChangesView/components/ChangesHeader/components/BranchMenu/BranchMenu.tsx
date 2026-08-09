// BranchMenu — Dracula design-system revision (v3 of the visual language).
//
// Two parallel action paths:
//   • Left click a branch row  → switch to it
//   • Right click a branch row → context menu with switch / merge / new-from /
//     rename / copy actions. The old hover-only inline merge button is gone.
//
// The `+ new` header entry point creates a branch based on HEAD; "从此分支新建…"
// in the right-click menu creates one based on the right-clicked ref. Both
// share the same inline create panel.

import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
	VscAdd,
	VscArrowRight,
	VscCheck,
	VscChevronDown,
	VscCloudDownload,
	VscCopy,
	VscEdit,
	VscGitMerge,
	VscRefresh,
	VscSourceControl,
} from "react-icons/vsc";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { MergeConflictDialog } from "./components/MergeConflictDialog";

const BRANCH_QUERY_STALE_TIME_MS = 10_000;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._/-][A-Za-z0-9._/@+-]*$/;

interface BranchMenuProps {
	workspaceId: string;
}

interface RowMeta {
	name: string;
	isCurrent: boolean;
	isRemoteOnly: boolean;
}

export function BranchMenu({ workspaceId }: BranchMenuProps) {
	const { t } = useTranslation();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	// Inline create panel state — { baseRef } | null. `baseRef` is decided at
	// the entry point (HEAD from header, right-clicked branch from ctx menu)
	// and shown for reference; it is not editable inside the panel.
	const [creating, setCreating] = useState<{ baseRef: string } | null>(null);
	const [newBranchName, setNewBranchName] = useState("");
	const [newBranchError, setNewBranchError] = useState<string | null>(null);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState("");
	const [conflictingBranch, setConflictingBranch] = useState<string | null>(
		null,
	);
	const newInputRef = useRef<HTMLInputElement>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);

	const branchQueryKey = ["git-branches", hostUrl, workspaceId] as const;
	const { data: branchData, isLoading } = useQuery({
		queryKey: branchQueryKey,
		enabled: Boolean(hostUrl && workspaceId),
		queryFn: () => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.listBranches.query({
				workspaceId,
			});
		},
		staleTime: BRANCH_QUERY_STALE_TIME_MS,
		refetchOnWindowFocus: false,
	});

	const refreshBranchState = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: branchQueryKey }),
			queryClient.invalidateQueries({
				queryKey: ["git-changes-status", hostUrl, workspaceId],
			}),
			queryClient.invalidateQueries({
				queryKey: ["git-branch-sync-status", hostUrl, workspaceId],
			}),
		]);
	};

	const finishBranchChange = async (message: string) => {
		toast.success(message);
		setOpen(false);
		setSearch("");
		setCreating(null);
		setNewBranchName("");
		setRenaming(null);
		await refreshBranchState();
	};

	const switchBranch = useMutation({
		mutationFn: ({ branch }: { branch: string }) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.switchBranch.mutate({
				workspaceId,
				branch,
			});
		},
		onSuccess: (_data, variables) =>
			finishBranchChange(
				t("v1Changes.branchMenu.toastSwitched", {
					branch: variables.branch,
				}),
			),
		onError: (error) =>
			toast.error(
				t("v1Changes.branchMenu.toastSwitchFailed", {
					message: error.message,
				}),
			),
	});

	const checkoutRemoteBranch = useMutation({
		mutationFn: ({ branch }: { branch: string }) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.checkoutRemoteBranch.mutate(
				{ workspaceId, branch },
			);
		},
		onSuccess: (_data, variables) =>
			finishBranchChange(
				t("v1Changes.branchMenu.toastRemoteCheckedOut", {
					branch: variables.branch,
				}),
			),
		onError: (error) =>
			toast.error(
				t("v1Changes.branchMenu.toastSwitchFailed", {
					message: error.message,
				}),
			),
	});

	const createBranch = useMutation({
		mutationFn: ({ branch }: { branch: string }) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.createBranch.mutate({
				workspaceId,
				branch,
			});
		},
		onSuccess: (_data, variables) =>
			finishBranchChange(
				t("v1Changes.branchMenu.toastCreated", {
					branch: variables.branch,
				}),
			),
		onError: (error) => setNewBranchError(error.message),
	});

	const fetchBranches = useMutation({
		mutationFn: () => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.fetchBranches.mutate({
				workspaceId,
			});
		},
		onSuccess: async () => {
			toast.success(t("v1Changes.branchMenu.toastFetched"));
			await refreshBranchState();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.branchMenu.toastFetchFailed", {
					message: error.message,
				}),
			),
	});

	const pullBranch = useMutation({
		mutationFn: ({ branch }: { branch: string }) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.pullBranch.mutate({
				workspaceId,
				branch,
			});
		},
		onSuccess: async (_data, variables) => {
			toast.success(
				t("v1Changes.branchMenu.toastPulled", { branch: variables.branch }),
			);
			await refreshBranchState();
		},
		onError: (error, variables) =>
			toast.error(
				t("v1Changes.branchMenu.toastPullFailed", {
					branch: variables.branch,
					message: error.message,
				}),
			),
	});

	const mergeBranch = useMutation({
		mutationFn: ({ branch }: { branch: string }) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.mergeBranch.mutate({
				workspaceId,
				branch,
			});
		},
		onSuccess: async (_data, variables) => {
			toast.success(
				t("v1Changes.branchMenu.toastMerged", { branch: variables.branch }),
			);
			setOpen(false);
			await refreshBranchState();
		},
		onError: (error, variables) => {
			if (error.message.toLowerCase().includes("conflict")) {
				setOpen(false);
				setConflictingBranch(variables.branch.replace(/^origin\//, ""));
				return;
			}
			toast.error(
				t("v1Changes.branchMenu.toastMergeFailed", {
					message: error.message,
				}),
			);
		},
	});

	const renameBranch = useMutation({
		mutationFn: ({
			oldName,
			newName,
		}: {
			oldName: string;
			newName: string;
		}) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.renameBranch.mutate({
				workspaceId,
				oldName,
				newName,
			});
		},
		onSuccess: (_data, variables) =>
			finishBranchChange(
				t("v1Changes.branchMenu.renameToastSuccess", {
					branch: variables.newName,
				}),
			),
		onError: (error) =>
			toast.error(
				t("v1Changes.branchMenu.renameToastFail", {
					message: error.message,
				}),
			),
	});

	const currentBranch =
		branchData?.branches.find((branch) => branch.isHead)?.name ?? "";
	const localBranchNames = useMemo(
		() => new Set((branchData?.branches ?? []).map(({ name }) => name)),
		[branchData?.branches],
	);
	const query = search.trim().toLowerCase();
	const localBranches = (branchData?.branches ?? []).filter(({ name }) =>
		name.toLowerCase().includes(query),
	);
	const remoteOnlyBranches = (branchData?.remoteBranches ?? []).filter(
		(branch) =>
			!localBranchNames.has(branch) && branch.toLowerCase().includes(query),
	);
	const isMutating =
		switchBranch.isPending ||
		checkoutRemoteBranch.isPending ||
		createBranch.isPending ||
		pullBranch.isPending ||
		mergeBranch.isPending ||
		renameBranch.isPending;

	const openCreatePanel = (baseRef: string) => {
		setCreating({ baseRef });
		setNewBranchError(null);
		// Seed the input with the user's search text if they were typing to
		// create — a small UX win borrowed from IntelliJ's dialog.
		setNewBranchName(search.trim());
		requestAnimationFrame(() => newInputRef.current?.focus());
	};

	const handleCreateBranch = () => {
		const branch = newBranchName.trim();
		if (!BRANCH_NAME_PATTERN.test(branch)) {
			setNewBranchError(t("v1Changes.branchMenu.newBranchInvalid"));
			return;
		}
		if (localBranchNames.has(branch)) {
			setNewBranchError(t("v1Changes.branchMenu.newBranchExists", { branch }));
			return;
		}
		setNewBranchError(null);
		// Backend only supports "create from HEAD" today, so switch to the base
		// first if it differs, then create. This mirrors the git CLI:
		//   git switch <baseRef> && git switch -c <branch>
		if (creating && creating.baseRef !== currentBranch) {
			switchBranch.mutate(
				{ branch: creating.baseRef },
				{
					onSuccess: () => createBranch.mutate({ branch }),
				},
			);
		} else {
			createBranch.mutate({ branch });
		}
	};

	const startRename = (branch: string) => {
		setRenaming(branch);
		setRenameDraft(branch);
		requestAnimationFrame(() => renameInputRef.current?.focus());
	};

	const commitRename = (oldName: string) => {
		const newName = renameDraft.trim();
		if (!newName || newName === oldName) {
			setRenaming(null);
			return;
		}
		if (!BRANCH_NAME_PATTERN.test(newName)) return;
		renameBranch.mutate({ oldName, newName });
	};

	const copyBranchName = (branch: string) => {
		navigator.clipboard?.writeText(branch);
		toast.success(t("v1Changes.branchMenu.copiedToast", { branch }));
	};

	const rowContextMenu = (row: RowMeta) => (
		<ContextMenuContent className="min-w-[220px]">
			<ContextMenuLabel className="font-mono text-[11px] text-fg">
				<VscSourceControl className="mr-2 inline size-3 text-accent-solid" />
				{row.name}
			</ContextMenuLabel>
			<ContextMenuSeparator />
			<ContextMenuGroup>
				<ContextMenuLabel className="text-[9.5px] uppercase tracking-wider text-fg-mute">
					{t("v1Changes.branchMenu.actionsGroup")}
				</ContextMenuLabel>
				<ContextMenuItem
					disabled={row.isCurrent || isMutating}
					onClick={() => {
						if (row.isRemoteOnly) {
							checkoutRemoteBranch.mutate({ branch: row.name });
						} else {
							switchBranch.mutate({ branch: row.name });
						}
					}}
				>
					<VscArrowRight className="size-3.5" />
					<span>{t("v1Changes.branchMenu.switchTo")}</span>
				</ContextMenuItem>
				<ContextMenuItem
					disabled={row.isCurrent || isMutating}
					onClick={() =>
						mergeBranch.mutate({
							branch: row.isRemoteOnly ? `origin/${row.name}` : row.name,
						})
					}
				>
					<VscGitMerge className="size-3.5" />
					<span>{t("v1Changes.branchMenu.mergeIntoCurrent")}</span>
				</ContextMenuItem>
				<ContextMenuItem onClick={() => openCreatePanel(row.name)}>
					<VscAdd className="size-3.5" />
					<span>{t("v1Changes.branchMenu.newFromHere")}</span>
				</ContextMenuItem>
			</ContextMenuGroup>
			{row.isRemoteOnly ? null : (
				<>
					<ContextMenuSeparator />
					<ContextMenuGroup>
						<ContextMenuLabel className="text-[9.5px] uppercase tracking-wider text-fg-mute">
							{t("v1Changes.branchMenu.syncGroup")}
						</ContextMenuLabel>
						<ContextMenuItem
							disabled={row.isCurrent || isMutating}
							onClick={() => pullBranch.mutate({ branch: row.name })}
						>
							<VscCloudDownload className="size-3.5" />
							<span>{t("v1Changes.branchMenu.pullBranch")}</span>
						</ContextMenuItem>
					</ContextMenuGroup>
				</>
			)}
			<ContextMenuSeparator />
			<ContextMenuGroup>
				<ContextMenuLabel className="text-[9.5px] uppercase tracking-wider text-fg-mute">
					{t("v1Changes.branchMenu.manageGroup")}
				</ContextMenuLabel>
				{row.isRemoteOnly ? null : (
					<ContextMenuItem
						disabled={isMutating}
						onClick={() => startRename(row.name)}
					>
						<VscEdit className="size-3.5" />
						<span>{t("v1Changes.branchMenu.rename")}</span>
					</ContextMenuItem>
				)}
				<ContextMenuItem onClick={() => copyBranchName(row.name)}>
					<VscCopy className="size-3.5" />
					<span>{t("v1Changes.branchMenu.copyName")}</span>
				</ContextMenuItem>
			</ContextMenuGroup>
		</ContextMenuContent>
	);

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={cn(
							"h-7 min-w-0 max-w-56 gap-1.5 rounded-full border border-line/60 px-2.5 text-xs font-medium",
							"hover:border-line hover:bg-hover",
							open && "border-line bg-hover",
						)}
						disabled={isLoading}
					>
						<VscSourceControl className="size-3.5 shrink-0 text-fg-mute" />
						<span className="truncate font-mono text-[11px] tracking-tight">
							{currentBranch || t("v1Changes.branchMenu.title")}
						</span>
						<VscChevronDown
							className={cn(
								"size-3 shrink-0 text-fg-mute transition-transform",
								open && "rotate-180",
							)}
						/>
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[340px] p-0">
					<div className="flex items-center gap-1 border-b border-line/60 px-3 py-2">
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("v1Changes.header.searchBranches")}
							className="h-7 flex-1 border-0 bg-transparent px-1 text-[13px] font-medium shadow-none focus-visible:ring-0"
							autoFocus
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									disabled={fetchBranches.isPending}
									onClick={() => fetchBranches.mutate()}
								>
									<VscRefresh
										className={cn(
											"size-3.5",
											fetchBranches.isPending && "animate-spin",
										)}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent showArrow={false}>
								{t("v1Changes.branchMenu.fetchRemote")}
							</TooltipContent>
						</Tooltip>
					</div>

					{/* Group header: Local branches + "+ New" action */}
					<div className="flex items-center justify-between px-3 pb-1 pt-2">
						<span className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-mute">
							{t("v1Changes.branchMenu.localBranches")} · {localBranches.length}
						</span>
						<button
							type="button"
							className={cn(
								"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] text-fg-mute",
								"hover:bg-hover hover:text-fg",
								creating && "bg-hover text-fg",
							)}
							onClick={() =>
								creating
									? setCreating(null)
									: openCreatePanel(currentBranch || "HEAD")
							}
						>
							<VscAdd className="size-2.5" />
							{t("v1Changes.branchMenu.newBranch")}
						</button>
					</div>

					{creating ? (
						<div className="mx-2 mb-2 rounded-ds-5 border border-line/60 bg-accent-tint px-3 py-2.5">
							<div className="mb-2 flex items-center gap-2 text-[10.5px] text-fg-mute">
								<span className="text-[9.5px] font-medium uppercase tracking-[0.18em]">
									Base
								</span>
								<span className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 font-mono">
									<VscSourceControl className="size-2.5" />
									{creating.baseRef}
									{creating.baseRef === currentBranch ? (
										<span className="ml-1 rounded-full bg-accent-tint px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-accent-solid">
											{t("v1Changes.branchMenu.currentBadge")}
										</span>
									) : null}
								</span>
							</div>
							<div className="flex gap-1">
								<Input
									ref={newInputRef}
									value={newBranchName}
									onChange={(event) => {
										setNewBranchName(event.target.value);
										setNewBranchError(null);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											handleCreateBranch();
										} else if (event.key === "Escape") {
											event.preventDefault();
											event.stopPropagation();
											setCreating(null);
										}
									}}
									placeholder={t("v1Changes.branchMenu.newBranchPlaceholder")}
									className="h-7 font-mono text-xs"
								/>
								<Button
									size="sm"
									className="h-7 rounded-full px-3 text-xs"
									disabled={!newBranchName.trim() || createBranch.isPending}
									onClick={handleCreateBranch}
								>
									{t("v1Changes.branchMenu.newBranchCreate")}
								</Button>
							</div>
							{newBranchError ? (
								<p className="mt-1.5 text-[11px] text-destructive">
									{newBranchError}
								</p>
							) : null}
						</div>
					) : null}

					<div className="max-h-[360px] overflow-y-auto pb-1">
						{localBranches.map(({ name: branch }) => {
							const isCurrent = branch === currentBranch;
							const isRenaming = renaming === branch;
							return (
								<ContextMenu key={branch}>
									<ContextMenuTrigger asChild>
										<div
											className={cn(
												"flex h-[34px] items-center gap-2 px-3 text-xs",
												"hover:bg-hover",
												isCurrent && "bg-accent-tint",
											)}
										>
											{isRenaming ? (
												<>
													<VscSourceControl className="size-3 shrink-0 text-fg-mute" />
													<Input
														ref={renameInputRef}
														value={renameDraft}
														onChange={(event) =>
															setRenameDraft(event.target.value)
														}
														onKeyDown={(event) => {
															if (event.key === "Enter") {
																event.preventDefault();
																commitRename(branch);
															} else if (event.key === "Escape") {
																event.preventDefault();
																setRenaming(null);
															}
														}}
														onBlur={() => setRenaming(null)}
														className="h-6 flex-1 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0"
													/>
												</>
											) : (
												<button
													type="button"
													className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
													disabled={isCurrent || isMutating}
													onClick={() => switchBranch.mutate({ branch })}
												>
													{isCurrent ? (
														<VscCheck className="size-3 shrink-0 text-accent-solid" />
													) : (
														<VscSourceControl className="size-3 shrink-0 text-fg-mute" />
													)}
													<span className="truncate font-mono">{branch}</span>
													{isCurrent ? (
														<span className="ml-auto text-[9.5px] font-semibold uppercase tracking-wider text-accent-solid">
															{t("v1Changes.branchMenu.currentBadge")}
														</span>
													) : null}
												</button>
											)}
										</div>
									</ContextMenuTrigger>
									{rowContextMenu({
										name: branch,
										isCurrent,
										isRemoteOnly: false,
									})}
								</ContextMenu>
							);
						})}

						{remoteOnlyBranches.length > 0 ? (
							<div className="mt-1 flex items-center justify-between border-t border-line/60 px-3 pb-1 pt-2">
								<span className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-mute">
									{t("v1Changes.branchMenu.remoteBranches")} ·{" "}
									{remoteOnlyBranches.length}
								</span>
							</div>
						) : null}

						{remoteOnlyBranches.map((branch) => (
							<ContextMenu key={branch}>
								<ContextMenuTrigger asChild>
									<div className="flex h-[34px] items-center gap-2 px-3 text-xs hover:bg-hover">
										<button
											type="button"
											className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
											disabled={isMutating}
											onClick={() => checkoutRemoteBranch.mutate({ branch })}
										>
											<VscCloudDownload className="size-3 shrink-0 text-fg-mute" />
											<span className="truncate font-mono">{branch}</span>
											<span className="ml-auto text-[9.5px] font-mono text-fg-mute">
												origin
											</span>
										</button>
									</div>
								</ContextMenuTrigger>
								{rowContextMenu({
									name: branch,
									isCurrent: false,
									isRemoteOnly: true,
								})}
							</ContextMenu>
						))}

						{localBranches.length === 0 && remoteOnlyBranches.length === 0 ? (
							<div className="px-3 py-8 text-center text-xs text-fg-mute">
								{t("v1Changes.header.noBranchesFound")}
							</div>
						) : null}
					</div>

					<div className="border-t border-line/60 px-3 py-2 text-[10.5px] text-fg-mute">
						{t("v1Changes.branchMenu.hintRightClick")}
					</div>
				</PopoverContent>
			</Popover>
			<MergeConflictDialog
				branch={conflictingBranch}
				onOpenChange={(isOpen) => {
					if (!isOpen) setConflictingBranch(null);
				}}
			/>
		</>
	);
}
