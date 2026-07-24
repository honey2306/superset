import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import { LuCheck, LuLoaderCircle, LuMinus, LuX } from "react-icons/lu";
import type { MessageKey } from "renderer/providers/I18nProvider";

export type PullRequestCheck = NonNullable<
	GitHubStatus["pr"]
>["checks"][number];

export const ALL_COMMENTS_COPY_ACTION_KEY = "comments:all";

export const reviewDecisionConfig = {
	approved: {
		labelKey: "v1Changes.reviewState.approved" as const satisfies MessageKey,
		className:
			"border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	changes_requested: {
		labelKey:
			"v1Changes.reviewState.changesRequested" as const satisfies MessageKey,
		className:
			"border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
	},
	pending: {
		labelKey:
			"v1Changes.reviewState.reviewPending" as const satisfies MessageKey,
		className:
			"border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
} as const;

export const checkIconConfig = {
	success: {
		icon: LuCheck,
		className: "text-emerald-600 dark:text-emerald-400",
		labelKey: "v1Changes.checkState.passed" as const satisfies MessageKey,
	},
	failure: {
		icon: LuX,
		className: "text-red-600 dark:text-red-400",
		labelKey: "v1Changes.checkState.failed" as const satisfies MessageKey,
	},
	pending: {
		icon: LuLoaderCircle,
		className: "text-amber-600 dark:text-amber-400",
		labelKey: "v1Changes.checkState.pending" as const satisfies MessageKey,
	},
	skipped: {
		icon: LuMinus,
		className: "text-muted-foreground",
		labelKey: "v1Changes.checkState.skipped" as const satisfies MessageKey,
	},
	cancelled: {
		icon: LuMinus,
		className: "text-muted-foreground",
		labelKey: "v1Changes.checkState.cancelled" as const satisfies MessageKey,
	},
} as const;

export const checkSummaryIconConfig = {
	success: checkIconConfig.success,
	failure: checkIconConfig.failure,
	pending: checkIconConfig.pending,
	none: {
		icon: LuMinus,
		className: "text-muted-foreground",
		labelKey: "v1Changes.checkSummary.noChecks" as const satisfies MessageKey,
	},
} as const;

export const prStateLabelKey = {
	open: "v1Changes.prState.open",
	draft: "v1Changes.prState.draft",
	merged: "v1Changes.prState.merged",
	closed: "v1Changes.prState.closed",
} as const satisfies Record<string, MessageKey>;

export function resolveCheckDestinationUrl(
	check: PullRequestCheck,
	prUrl: string,
): string | undefined {
	if (check.url) {
		return check.url;
	}

	const normalizedName = check.name.trim().toLowerCase();
	if (
		normalizedName.includes("coderabbit") ||
		normalizedName.includes("code rabbit")
	) {
		return prUrl;
	}

	return undefined;
}

export function getCommentPreviewText(
	body: string,
	t: (key: MessageKey) => string,
): string {
	return (
		body
			.replace(/<!--[\s\S]*?-->/g, "\n")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean)
			?.replace(/^[-*+>]\s*/, "")
			?.replace(/\s+/g, " ") ?? t("v1Changes.commentPreview.noPreview")
	);
}

export function getCommentAvatarFallback(authorLogin: string): string {
	return authorLogin.slice(0, 2).toUpperCase();
}

export function formatShortAge(timestamp?: number): string | null {
	if (!timestamp || Number.isNaN(timestamp)) {
		return null;
	}

	const deltaMs = Math.max(0, Date.now() - timestamp);
	const deltaSeconds = Math.round(deltaMs / 1000);

	if (deltaSeconds < 60) {
		return `${Math.max(1, deltaSeconds)}s`;
	}

	const deltaMinutes = Math.round(deltaSeconds / 60);
	if (deltaMinutes < 60) {
		return `${deltaMinutes}m`;
	}

	const deltaHours = Math.round(deltaMinutes / 60);
	if (deltaHours < 24) {
		return `${deltaHours}h`;
	}

	return `${Math.round(deltaHours / 24)}d`;
}

function getCommentClipboardLocation(
	comment: PullRequestComment,
): string | null {
	if (comment.path) {
		return comment.line ? `${comment.path}:${comment.line}` : comment.path;
	}

	return comment.kind === "conversation" ? "Conversation" : null;
}

export function getCommentKindText(comment: PullRequestComment): MessageKey {
	return comment.kind === "review"
		? "v1Changes.commentKind.review"
		: "v1Changes.commentKind.comment";
}

export function buildCommentClipboardText(
	comment: PullRequestComment,
	t: (key: MessageKey) => string,
	includeMetadata = false,
): string {
	const body = comment.body.trim() || t("v1Changes.commentBody.empty");

	if (!includeMetadata) {
		return body;
	}

	const location = getCommentClipboardLocation(comment);
	const kindText = comment.kind === "review" ? "Review" : "Comment";
	const metadata = [comment.authorLogin, kindText, location].filter(Boolean);

	return [metadata.join(" • "), body].filter(Boolean).join("\n\n");
}

export function buildAllCommentsClipboardText(
	comments: PullRequestComment[],
	t: (key: MessageKey) => string,
): string {
	return comments
		.map((comment) => buildCommentClipboardText(comment, t, true))
		.join("\n\n---\n\n");
}

export function splitPullRequestComments(comments: PullRequestComment[]): {
	active: PullRequestComment[];
	resolved: PullRequestComment[];
} {
	return {
		active: comments.filter((comment) => comment.isResolved !== true),
		resolved: comments.filter((comment) => comment.isResolved === true),
	};
}

export function countOpenPullRequestComments(
	comments: PullRequestComment[],
): number {
	return comments.filter((comment) => comment.isResolved !== true).length;
}

export function getCommentCopyActionKey(
	commentId: PullRequestComment["id"],
): string {
	return `comment:${commentId}`;
}
