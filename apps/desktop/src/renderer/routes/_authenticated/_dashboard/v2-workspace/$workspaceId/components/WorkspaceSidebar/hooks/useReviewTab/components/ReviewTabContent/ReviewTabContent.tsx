import { memo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { CommentPaneData, DiffFocusSide } from "../../../../../../types";
import type { NormalizedComment, NormalizedPR } from "../../types";
import { ChecksSection } from "../ChecksSection";
import { CommentsSection } from "../CommentsSection";
import { PRHeader } from "../PRHeader";

interface ReviewTabContentProps {
	workspaceId: string;
	pr: NormalizedPR | null;
	comments: NormalizedComment[];
	isLoading: boolean;
	isError: boolean;
	isCommentsLoading: boolean;
	onOpenComment?: (comment: CommentPaneData) => void;
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

export const ReviewTabContent = memo(function ReviewTabContent({
	workspaceId,
	pr,
	comments,
	isLoading,
	isError,
	isCommentsLoading,
	onOpenComment,
	onOpenInDiff,
}: ReviewTabContentProps) {
	const { t } = useTranslation();
	if (isError) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
				{t("v2Workspace.review.unableToLoad")}
			</div>
		);
	}

	if (isLoading && !pr) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t("v2Workspace.review.loading")}
			</div>
		);
	}

	if (!pr) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
				{t("v2Workspace.review.empty")}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto">
			<PRHeader pr={pr} />

			<div className="my-1 border-b border-border/70" />

			<ChecksSection
				workspaceId={workspaceId}
				checks={pr.checks}
				checksStatus={pr.checksStatus}
				prUrl={pr.url}
			/>

			<div className="my-1 border-b border-border/70" />

			<CommentsSection
				workspaceId={workspaceId}
				comments={comments}
				isLoading={isCommentsLoading}
				onOpenComment={onOpenComment}
				onOpenInDiff={onOpenInDiff}
			/>
		</div>
	);
});
