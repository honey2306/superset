import { useTranslation } from "renderer/providers/I18nProvider";

interface PullRequestStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed" | "queued";
}

export function PullRequestStatusBadge({ state }: PullRequestStatusBadgeProps) {
	const { t } = useTranslation();
	const styles = {
		open: "bg-emerald-500/15 text-emerald-500",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-violet-500/15 text-violet-500",
		closed: "bg-destructive/15 text-destructive-foreground",
		queued: "bg-amber-500/15 text-amber-500",
	};

	const labels = {
		open: t("workspace.prOpen"),
		draft: t("workspace.prDraft"),
		merged: t("workspace.prMerged"),
		closed: t("workspace.prClosed"),
		queued: t("workspace.prQueued"),
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${styles[state]}`}
		>
			{labels[state]}
		</span>
	);
}
