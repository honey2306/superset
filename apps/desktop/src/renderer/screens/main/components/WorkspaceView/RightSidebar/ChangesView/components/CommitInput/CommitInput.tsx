import type { GitHubStatus } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	VscArrowDown,
	VscArrowUp,
	VscCheck,
	VscChevronDown,
	VscLinkExternal,
	VscRefresh,
	VscSync,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCreateOrOpenPR } from "renderer/screens/main/hooks";
import { getPrimaryAction } from "./utils/getPrimaryAction";
import { getPushActionCopy } from "./utils/getPushActionCopy";

type CommitInputPullRequest = NonNullable<GitHubStatus["pr"]>;

interface CommitInputProps {
	worktreePath: string;
	hasStagedChanges: boolean;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	pullRequest?: CommitInputPullRequest | null;
	canCreatePR: boolean;
	shouldAutoCreatePRAfterPublish: boolean;
	onRefresh: () => void;
}

export function CommitInput({
	worktreePath,
	hasStagedChanges,
	pushCount,
	pullCount,
	hasUpstream,
	pullRequest,
	canCreatePR,
	shouldAutoCreatePRAfterPublish,
	onRefresh,
}: CommitInputProps) {
	const { t } = useTranslation();
	const [commitMessage, setCommitMessage] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const commitMutation = electronTrpc.changes.commit.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastCommitted"));
			setCommitMessage("");
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastCommitFailed", { message: error.message }),
			),
	});

	const pushMutation = electronTrpc.changes.push.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastPushed"));
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastPushFailed", { message: error.message }),
			),
	});

	const pullMutation = electronTrpc.changes.pull.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastPulled"));
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastPullFailed", { message: error.message }),
			),
	});

	const syncMutation = electronTrpc.changes.sync.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastSynced"));
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastSyncFailed", { message: error.message }),
			),
	});

	const { createOrOpenPR, isPending: isCreateOrOpenPRPending } =
		useCreateOrOpenPR({
			worktreePath,
			onSuccess: onRefresh,
		});

	const fetchMutation = electronTrpc.changes.fetch.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.commit.toastFetched"));
			onRefresh();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.commit.toastFetchFailed", { message: error.message }),
			),
	});

	const isPending =
		commitMutation.isPending ||
		pushMutation.isPending ||
		pullMutation.isPending ||
		syncMutation.isPending ||
		isCreateOrOpenPRPending ||
		fetchMutation.isPending;

	const canCommit = hasStagedChanges && commitMessage.trim();
	const hasExistingPR = Boolean(pullRequest);
	const prUrl = pullRequest?.url;
	const pushActionCopy = getPushActionCopy({
		hasUpstream,
		pushCount,
		pullRequest,
	});

	const handleCommit = () => {
		if (!canCommit) return;
		commitMutation.mutate({ worktreePath, message: commitMessage.trim() });
	};

	const handlePush = () => {
		const isPublishing = !hasUpstream;
		pushMutation.mutate(
			{ worktreePath, setUpstream: true },
			{
				onSuccess: () => {
					if (
						isPublishing &&
						!hasExistingPR &&
						shouldAutoCreatePRAfterPublish
					) {
						createOrOpenPR();
					}
				},
			},
		);
	};
	const handlePull = () => pullMutation.mutate({ worktreePath });
	const handleSync = () => syncMutation.mutate({ worktreePath });
	const handleFetch = () => fetchMutation.mutate({ worktreePath });
	const handleFetchAndPull = () => {
		fetchMutation.mutate(
			{ worktreePath },
			{ onSuccess: () => pullMutation.mutate({ worktreePath }) },
		);
	};
	const handleCreatePR = () => {
		if (!canCreatePR) return;
		createOrOpenPR();
	};
	const handleOpenPR = () => prUrl && window.open(prUrl, "_blank");

	const handleCommitAndPush = () => {
		if (!canCommit) return;
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{ onSuccess: handlePush },
		);
	};

	const handleCommitPushAndCreatePR = () => {
		if (!canCommit) return;
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{
				onSuccess: () => {
					pushMutation.mutate(
						{ worktreePath, setUpstream: true },
						{ onSuccess: handleCreatePR },
					);
				},
			},
		);
	};

	const primaryAction = getPrimaryAction({
		canCommit: Boolean(canCommit),
		hasStagedChanges,
		isPending,
		pushCount,
		pullCount,
		hasUpstream,
		pushActionCopy,
	});

	const primary = {
		...primaryAction,
		icon:
			primaryAction.action === "commit" ? (
				<VscCheck className="size-4" />
			) : primaryAction.action === "sync" ? (
				<VscSync className="size-4" />
			) : primaryAction.action === "pull" ? (
				<VscArrowDown className="size-4" />
			) : (
				<VscArrowUp className="size-4" />
			),
		handler:
			primaryAction.action === "commit"
				? handleCommit
				: primaryAction.action === "sync"
					? handleSync
					: primaryAction.action === "pull"
						? handlePull
						: handlePush,
	};

	const countBadge =
		pushCount > 0 || pullCount > 0
			? `${pullCount > 0 ? pullCount : ""}${pullCount > 0 && pushCount > 0 ? "/" : ""}${pushCount > 0 ? pushCount : ""}`
			: null;

	return (
		<div className="flex flex-col gap-1.5 px-2 py-2">
			<Textarea
				placeholder={t("v1Changes.commit.placeholder")}
				value={commitMessage}
				onChange={(e) => setCommitMessage(e.target.value)}
				className="min-h-[52px] resize-none text-[10px] bg-background"
				onKeyDown={(e) => {
					if (
						e.key === "Enter" &&
						(e.metaKey || e.ctrlKey) &&
						!primary.disabled
					) {
						e.preventDefault();
						primary.handler();
					}
				}}
			/>
			<ButtonGroup className="w-full">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							className="flex-1 gap-1.5 h-7 text-xs"
							onClick={primary.handler}
							disabled={primary.disabled}
						>
							{primary.icon}
							<span>{t(primary.labelKey)}</span>
							{countBadge && (
								<span className="text-[10px] opacity-70">{countBadge}</span>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t(primary.tooltipKey, primary.tooltipValues)}
					</TooltipContent>
				</Tooltip>
				<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							disabled={isPending}
							className="h-7 px-1.5"
						>
							<VscChevronDown className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48 text-xs">
						<DropdownMenuItem
							onClick={handleCommit}
							disabled={!canCommit}
							className="text-xs"
						>
							<VscCheck className="size-3.5" />
							{t("v1Changes.commit.commit")}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleCommitAndPush}
							disabled={!canCommit}
							className="text-xs"
						>
							<VscArrowUp className="size-3.5" />
							{t("v1Changes.commit.commitAndPush")}
						</DropdownMenuItem>
						{!hasExistingPR && canCreatePR && (
							<DropdownMenuItem
								onClick={handleCommitPushAndCreatePR}
								disabled={!canCommit}
								className="text-xs"
							>
								<VscLinkExternal className="size-3.5" />
								{t("v1Changes.commit.commitPushCreatePR")}
							</DropdownMenuItem>
						)}

						<DropdownMenuSeparator />

						<DropdownMenuItem
							onClick={handlePush}
							disabled={pushCount === 0 && hasUpstream}
							className="text-xs"
						>
							<VscArrowUp className="size-3.5" />
							<span className="flex-1">{t(pushActionCopy.menuLabelKey)}</span>
							{pushCount > 0 && (
								<span className="text-[10px] text-fg-mute">{pushCount}</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handlePull}
							disabled={pullCount === 0}
							className="text-xs"
						>
							<VscArrowDown className="size-3.5" />
							<span className="flex-1">{t("v1Changes.commit.pull")}</span>
							{pullCount > 0 && (
								<span className="text-[10px] text-fg-mute">{pullCount}</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleSync}
							disabled={pushCount === 0 && pullCount === 0}
							className="text-xs"
						>
							<VscSync className="size-3.5" />
							{t("v1Changes.commit.sync")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleFetch} className="text-xs">
							<VscRefresh className="size-3.5" />
							{t("v1Changes.commit.fetch")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleFetchAndPull} className="text-xs">
							<VscRefresh className="size-3.5" />
							{t("v1Changes.commit.fetchAndPull")}
						</DropdownMenuItem>

						<DropdownMenuSeparator />

						{hasExistingPR ? (
							<DropdownMenuItem onClick={handleOpenPR} className="text-xs">
								<VscLinkExternal className="size-3.5" />
								{t("v1Changes.commit.openPullRequest")}
							</DropdownMenuItem>
						) : canCreatePR ? (
							<DropdownMenuItem onClick={handleCreatePR} className="text-xs">
								<VscLinkExternal className="size-3.5" />
								{t("v1Changes.commit.createPullRequest")}
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</ButtonGroup>
		</div>
	);
}
