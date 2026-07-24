import { useTranslation } from "renderer/providers/I18nProvider";

interface PRStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed";
}

export function PRStatusBadge({ state }: PRStatusBadgeProps) {
	const { t } = useTranslation();
	const styles = {
		open: "bg-emerald-500/15 text-emerald-500",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-violet-500/15 text-violet-500",
		closed: "bg-destructive/15 text-destructive-foreground",
	};

	const labels = {
		open: t("workspace.prOpen"),
		draft: t("workspace.prDraft"),
		merged: t("workspace.prMerged"),
		closed: t("workspace.prClosed"),
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${styles[state]}`}
		>
			{labels[state]}
		</span>
	);
}
