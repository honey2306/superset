import { useTranslation } from "renderer/providers/I18nProvider";

interface ReviewStatusProps {
	status: "approved" | "changes_requested" | "pending";
	requestedReviewers?: string[];
}

export function ReviewStatus({
	status,
	requestedReviewers,
}: ReviewStatusProps) {
	const { t } = useTranslation();
	const config = {
		approved: {
			label: t("workspace.reviewApproved"),
			className: "bg-success-tint text-success",
		},
		changes_requested: {
			label: t("workspace.reviewChangesRequested"),
			className: "bg-destructive/15 text-destructive-foreground",
		},
		pending: {
			label:
				requestedReviewers && requestedReviewers.length > 0
					? t("workspace.awaitingReviewers", {
							reviewers: requestedReviewers.join(", "),
						})
					: t("workspace.reviewPending"),
			className: "bg-amber-500/15 text-amber-500",
		},
	};

	const { label, className } = config[status];

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-ds-3 shrink-0 truncate max-w-[200px] ${className}`}
			title={label}
		>
			{label}
		</span>
	);
}
