import type {
	GitHubStatus,
	PullRequestComment,
} from "@superset/shared/desktop-types";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuCheckCheck,
	LuCopy,
	LuLoaderCircle,
	LuUndo2,
} from "react-icons/lu";
import { VscChevronRight } from "react-icons/vsc";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { openCommentInPanes } from "renderer/lib/panes";
import type { MessageKey } from "renderer/providers/I18nProvider";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import {
	ALL_COMMENTS_COPY_ACTION_KEY,
	buildAllCommentsClipboardText,
	buildCommentClipboardText,
	checkIconConfig,
	checkSummaryIconConfig,
	formatShortAge,
	getCommentAvatarFallback,
	getCommentCopyActionKey,
	getCommentKindText,
	getCommentPreviewText,
	resolveCheckDestinationUrl,
	reviewDecisionConfig,
	splitPullRequestComments,
} from "./utils";

interface ReviewPanelProps {
	pr: GitHubStatus["pr"] | null;
	comments?: PullRequestComment[];
	isLoading?: boolean;
	isCommentsLoading?: boolean;
	workspaceId?: string;
	onCommentsChange?: () => void;
}

export function ReviewPanel({
	pr,
	comments = [],
	isLoading = false,
	isCommentsLoading = false,
	workspaceId,
	onCommentsChange,
}: ReviewPanelProps) {
	const { t } = useTranslation();
	const [checksOpen, setChecksOpen] = useState(true);
	const [commentsOpen, setCommentsOpen] = useState(true);
	const [resolvedCommentsGroupOpen, setResolvedCommentsGroupOpen] =
		useState(false);
	const [copiedActionKey, setCopiedActionKey] = useState<string | null>(null);
	const [resolvingThreadIds, setResolvingThreadIds] = useState<Set<string>>(
		new Set(),
	);
	const [isResolvingAll, setIsResolvingAll] = useState(false);
	const copiedActionResetTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const copyToClipboardMutation = electronTrpc.external.copyText.useMutation();
	const hostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	const resolveThreadMutation = useMutation({
		mutationFn: (input: {
			workspaceId: string;
			threadId: string;
			resolve: boolean;
		}) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).git.setReviewThreadResolution.mutate({
				workspaceId: input.workspaceId,
				threadId: input.threadId,
				resolved: input.resolve,
			});
		},
	});
	const handleOpenComment = (comment: PullRequestComment) => {
		if (!workspaceId) return;
		openCommentInPanes(workspaceId, {
			commentId: comment.id,
			authorLogin: comment.authorLogin,
			avatarUrl: comment.avatarUrl,
			body: comment.body,
			url: comment.url,
			path: comment.path,
			line: comment.line,
		});
	};

	useEffect(() => {
		return () => {
			if (copiedActionResetTimeoutRef.current) {
				clearTimeout(copiedActionResetTimeoutRef.current);
			}
		};
	}, []);

	const markCopiedAction = (actionKey: string) => {
		if (copiedActionResetTimeoutRef.current) {
			clearTimeout(copiedActionResetTimeoutRef.current);
		}

		setCopiedActionKey(actionKey);
		copiedActionResetTimeoutRef.current = setTimeout(() => {
			setCopiedActionKey(null);
			copiedActionResetTimeoutRef.current = null;
		}, 1500);
	};

	const copyTextToClipboard = async ({
		text,
		actionKey,
		errorToastKey,
	}: {
		text: string;
		actionKey: string;
		errorToastKey: MessageKey;
	}) => {
		try {
			await copyToClipboardMutation.mutateAsync(text);
			markCopiedAction(actionKey);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			toast.error(t(errorToastKey, { message }));
		}
	};

	const handleCopySingleComment = (comment: PullRequestComment) => {
		void copyTextToClipboard({
			text: buildCommentClipboardText(comment, t),
			actionKey: getCommentCopyActionKey(comment.id),
			errorToastKey: "changes.review.toastCopyCommentFailed",
		});
	};

	const handleToggleResolve = (comment: PullRequestComment) => {
		const threadId = comment.threadId;
		if (!workspaceId || !threadId) return;

		setResolvingThreadIds((prev) => new Set(prev).add(threadId));
		resolveThreadMutation.mutate(
			{
				workspaceId,
				threadId,
				resolve: !comment.isResolved,
			},
			{
				onSuccess: () => {
					onCommentsChange?.();
				},
				onError: (error) => {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					toast.error(
						t("changes.review.toastResolveFailed", {
							action: comment.isResolved
								? t("changes.review.ariaUndoDone")
								: t("changes.review.ariaMarkDone"),
							message,
						}),
					);
				},
				onSettled: () => {
					setResolvingThreadIds((prev) => {
						const next = new Set(prev);
						next.delete(threadId);
						return next;
					});
				},
			},
		);
	};

	if (isLoading && !pr) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-fg-mute">
				{t("changes.review.loading")}
			</div>
		);
	}

	if (!pr) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-fg-mute">
				{t("changes.review.openPR")}
			</div>
		);
	}

	const requestedReviewers = pr.requestedReviewers ?? [];

	const relevantChecks = pr.checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	);
	const passingChecks = relevantChecks.filter(
		(check) => check.status === "success",
	).length;
	const checksSummary =
		relevantChecks.length > 0
			? t("changes.review.checksPassing", {
					passing: passingChecks,
					total: relevantChecks.length,
				})
			: t("changes.review.noChecksReported");
	const checksStatus = relevantChecks.length > 0 ? pr.checksStatus : "none";
	const checksStatusConfig = checkSummaryIconConfig[checksStatus];
	const ChecksStatusIcon = checksStatusConfig.icon;
	const { active: activeComments, resolved: resolvedComments } =
		splitPullRequestComments(comments);
	const commentsCountLabel = isCommentsLoading ? "..." : comments.length;
	const copyAllCommentsLabel =
		copiedActionKey === ALL_COMMENTS_COPY_ACTION_KEY
			? t("changes.review.copied")
			: t("changes.review.copyAll");

	const handleCopyCommentsList = () => {
		void copyTextToClipboard({
			text: buildAllCommentsClipboardText(activeComments, t),
			actionKey: ALL_COMMENTS_COPY_ACTION_KEY,
			errorToastKey: "changes.review.toastCopyCommentsFailed",
		});
	};

	const uniqueResolvableThreadIds = [
		...new Set(
			activeComments.map((c) => c.threadId).filter((id): id is string => !!id),
		),
	];
	const handleResolveAll = async () => {
		if (!workspaceId || uniqueResolvableThreadIds.length === 0) return;

		const batchIds = uniqueResolvableThreadIds;
		setIsResolvingAll(true);
		setResolvingThreadIds((prev) => new Set([...prev, ...batchIds]));

		try {
			const results = await Promise.allSettled(
				batchIds.map((threadId) =>
					resolveThreadMutation.mutateAsync({
						workspaceId,
						threadId,
						resolve: true,
					}),
				),
			);
			const failed = results.filter((r) => r.status === "rejected");
			if (results.some((r) => r.status === "fulfilled")) {
				onCommentsChange?.();
			}
			if (failed.length > 0) {
				toast.error(
					t("changes.review.toastResolveAllFailed", { count: failed.length }),
				);
			}
		} finally {
			setIsResolvingAll(false);
			setResolvingThreadIds((prev) => {
				const next = new Set(prev);
				for (const id of batchIds) {
					next.delete(id);
				}
				return next;
			});
		}
	};

	const renderCommentList = (list: PullRequestComment[]) =>
		list.map((comment) => {
			const age = formatShortAge(comment.createdAt);
			const commentCopyActionKey = getCommentCopyActionKey(comment.id);
			const isCopied = copiedActionKey === commentCopyActionKey;
			const content = (
				<>
					<Avatar className="mt-0.5 size-4 shrink-0">
						{comment.avatarUrl ? (
							<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
						) : null}
						<AvatarFallback className="text-[10px] font-medium">
							{getCommentAvatarFallback(comment.authorLogin)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className="truncate text-xs font-medium text-fg">
								{comment.authorLogin}
							</span>
							<span className="shrink-0 rounded border border-line/70 bg-hover/50 px-1 py-0 text-[9px] uppercase tracking-wide text-fg-mute">
								{t(getCommentKindText(comment))}
							</span>
							<span className="flex-1" />
							{age ? (
								<span className="shrink-0 text-[10px] text-fg-mute">{age}</span>
							) : null}
						</div>
						<p className="mt-0.5 line-clamp-1 text-xs leading-4 text-fg-mute">
							{getCommentPreviewText(comment.body, t)}
						</p>
					</div>
				</>
			);

			return (
				<div
					key={comment.id}
					className="group relative flex items-start gap-1 rounded-sm px-1.5 py-1 transition-colors hover:bg-hover"
				>
					<button
						type="button"
						onClick={() => handleOpenComment(comment)}
						className="flex min-w-0 flex-1 items-start gap-2 text-left"
						aria-label={t("changes.review.ariaViewCommentBy", {
							author: comment.authorLogin,
						})}
					>
						{content}
					</button>
					<div className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-sm bg-background/90 px-0.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
						{comment.threadId && workspaceId ? (
							<button
								type="button"
								className="inline-flex size-5 items-center justify-center rounded-sm text-fg-mute transition-colors hover:bg-hover hover:text-fg"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									handleToggleResolve(comment);
								}}
								disabled={resolvingThreadIds.has(comment.threadId)}
								aria-label={
									comment.isResolved
										? t("changes.review.ariaUndoDone")
										: t("changes.review.ariaMarkDone")
								}
							>
								{resolvingThreadIds.has(comment.threadId) ? (
									<LuLoaderCircle className="size-3 animate-spin" />
								) : comment.isResolved ? (
									<LuUndo2 className="size-3" />
								) : (
									<LuCheckCheck className="size-3" />
								)}
							</button>
						) : null}
						<button
							type="button"
							className="inline-flex size-5 items-center justify-center rounded-sm text-fg-mute transition-colors hover:bg-hover hover:text-fg"
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								handleCopySingleComment(comment);
							}}
							aria-label={
								isCopied
									? t("changes.review.ariaCopiedComment")
									: t("changes.review.ariaCopyComment")
							}
						>
							{isCopied ? (
								<LuCheck className="size-3" />
							) : (
								<LuCopy className="size-3" />
							)}
						</button>
						{comment.url ? (
							<a
								href={comment.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex size-5 items-center justify-center rounded-sm text-fg-mute transition-colors hover:bg-hover hover:text-fg"
								aria-label={t("changes.review.ariaOpenCommentGitHub")}
							>
								<LuArrowUpRight className="size-3" />
							</a>
						) : null}
					</div>
				</div>
			);
		});

	return (
		<div className="flex h-full min-h-0 flex-col overflow-y-auto">
			<div className="px-2 py-2 space-y-1.5">
				<a
					href={pr.url}
					target="_blank"
					rel="noopener noreferrer"
					className="group flex items-center gap-1.5 cursor-pointer"
				>
					<PRIcon state={pr.state} className="size-4 shrink-0" />
					<span
						className="min-w-0 flex-1 truncate text-xs font-medium text-fg"
						title={pr.title}
					>
						{pr.title}
					</span>
					<LuArrowUpRight className="size-3.5 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100" />
				</a>
				<div className="flex items-center gap-1.5">
					<span
						className={cn(
							"shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
							reviewDecisionConfig[pr.reviewDecision].className,
						)}
					>
						{t(reviewDecisionConfig[pr.reviewDecision].labelKey)}
					</span>
					{requestedReviewers.length > 0 && (
						<span className="truncate text-[10px] text-fg-mute">
							{t("changes.review.awaiting", {
								reviewers: requestedReviewers.join(", "),
							})}
						</span>
					)}
				</div>
			</div>

			<div className="border-b border-line/70 my-1" />

			<Collapsible open={checksOpen} onOpenChange={setChecksOpen}>
				<CollapsibleTrigger
					className={cn(
						"flex w-full min-w-0 items-center justify-between gap-2 px-2 py-1.5 text-left",
						"hover:bg-hover cursor-pointer transition-colors",
					)}
				>
					<div className="flex min-w-0 items-center gap-1.5">
						<VscChevronRight
							className={cn(
								"size-3 text-fg-mute shrink-0 transition-transform duration-150",
								checksOpen && "rotate-90",
							)}
						/>
						<span className="text-xs font-medium truncate">
							{t("changes.review.checks")}
						</span>
						<span className="text-[10px] text-fg-mute shrink-0">
							{relevantChecks.length}
						</span>
					</div>
					<div
						className={cn(
							"shrink-0 flex items-center gap-1",
							checksStatusConfig.className,
						)}
					>
						<ChecksStatusIcon
							className={cn(
								"size-3.5 shrink-0",
								checksStatus === "pending" && "animate-spin",
							)}
						/>
						<span className="max-w-[140px] truncate text-[10px] normal-case">
							{checksSummary}
						</span>
					</div>
				</CollapsibleTrigger>
				<CollapsibleContent className="px-0.5 pb-1 min-w-0 overflow-hidden">
					{relevantChecks.length === 0 ? (
						<div className="px-1.5 py-1 text-xs text-fg-mute">
							{t("changes.review.noChecksReportedSentence")}
						</div>
					) : (
						relevantChecks.map((check) => {
							const { icon: CheckIcon, className } =
								checkIconConfig[check.status];
							const checkUrl = resolveCheckDestinationUrl(check, pr.url);

							return checkUrl ? (
								<a
									key={check.name}
									href={checkUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="group block"
								>
									<div className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-xs transition-colors hover:bg-hover">
										<CheckIcon
											className={cn(
												"size-3 shrink-0",
												className,
												check.status === "pending" && "animate-spin",
											)}
										/>
										<div className="flex min-w-0 flex-1 items-center gap-1">
											<span className="min-w-0 truncate">{check.name}</span>
											<LuArrowUpRight className="size-3.5 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
										</div>
										{check.durationText && (
											<span className="shrink-0 text-[10px] text-fg-mute">
												{check.durationText}
											</span>
										)}
									</div>
								</a>
							) : (
								<div
									key={check.name}
									className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-xs"
								>
									<CheckIcon
										className={cn(
											"size-3 shrink-0",
											className,
											check.status === "pending" && "animate-spin",
										)}
									/>
									<span className="min-w-0 flex-1 truncate">{check.name}</span>
									{check.durationText && (
										<span className="shrink-0 text-[10px] text-fg-mute">
											{check.durationText}
										</span>
									)}
								</div>
							);
						})
					)}
				</CollapsibleContent>
			</Collapsible>

			<div className="border-b border-line/70 my-1" />

			<Collapsible
				open={commentsOpen}
				onOpenChange={setCommentsOpen}
				className="min-w-0"
			>
				<div className="flex min-w-0 items-center">
					<CollapsibleTrigger
						className={cn(
							"flex flex-1 min-w-0 items-center gap-1.5 px-2 py-1.5 text-left",
							"hover:bg-hover cursor-pointer transition-colors",
						)}
					>
						<VscChevronRight
							className={cn(
								"size-3 text-fg-mute shrink-0 transition-transform duration-150",
								commentsOpen && "rotate-90",
							)}
						/>
						<span className="text-xs font-medium truncate">
							{t("changes.review.comments")}
						</span>
						<span className="text-[10px] text-fg-mute shrink-0">
							{commentsCountLabel}
						</span>
					</CollapsibleTrigger>
					{activeComments.length > 0 && (
						<div className="mr-1.5 flex items-center gap-1">
							{uniqueResolvableThreadIds.length > 0 && workspaceId && (
								<button
									type="button"
									className="shrink-0 flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-fg-mute transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
									onClick={() => void handleResolveAll()}
									disabled={isResolvingAll}
								>
									{isResolvingAll ? (
										<LuLoaderCircle className="size-3 animate-spin" />
									) : (
										<LuCheckCheck className="size-3" />
									)}
									<span>{t("changes.review.markAllDone")}</span>
								</button>
							)}
							<button
								type="button"
								className="shrink-0 flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-fg-mute transition-colors hover:bg-hover hover:text-fg"
								onClick={handleCopyCommentsList}
							>
								{copiedActionKey === ALL_COMMENTS_COPY_ACTION_KEY ? (
									<LuCheck className="size-3" />
								) : (
									<LuCopy className="size-3" />
								)}
								<span>{copyAllCommentsLabel}</span>
							</button>
						</div>
					)}
				</div>
				<CollapsibleContent className="px-0.5 pb-1 min-w-0 overflow-hidden">
					{isCommentsLoading ? (
						<div className="space-y-1 px-1">
							<Skeleton className="h-11 w-full rounded-sm" />
							<Skeleton className="h-11 w-full rounded-sm" />
							<Skeleton className="h-11 w-full rounded-sm" />
						</div>
					) : comments.length === 0 ? (
						<div className="px-1.5 py-1 text-xs text-fg-mute">
							{t("changes.review.noComments")}
						</div>
					) : (
						renderCommentList(activeComments)
					)}
				</CollapsibleContent>
			</Collapsible>

			{resolvedComments.length > 0 && (
				<Collapsible
					open={resolvedCommentsGroupOpen}
					onOpenChange={setResolvedCommentsGroupOpen}
					className="min-w-0"
				>
					<CollapsibleTrigger
						className={cn(
							"flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-left",
							"hover:bg-hover cursor-pointer transition-colors",
						)}
					>
						<VscChevronRight
							className={cn(
								"size-3 text-fg-mute shrink-0 transition-transform duration-150",
								resolvedCommentsGroupOpen && "rotate-90",
							)}
						/>
						<span className="text-xs font-medium truncate">
							{t("changes.review.resolved")}
						</span>
						<span className="text-[10px] text-fg-mute shrink-0">
							{resolvedComments.length}
						</span>
					</CollapsibleTrigger>
					<CollapsibleContent className="px-0.5 pb-1 min-w-0 overflow-hidden">
						{renderCommentList(resolvedComments)}
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
