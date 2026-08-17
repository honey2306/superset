import { useTranslation } from "renderer/providers/I18nProvider";

interface PRStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed";
}

export function PRStatusBadge({ state }: PRStatusBadgeProps) {
	const { t } = useTranslation();
	const styles = {
		open: "bg-success-tint text-success",
		draft: "bg-hover text-fg-mute",
		merged: "bg-accent-tint text-accent-2",
		closed: "bg-danger-tint text-danger",
	};

	const labels = {
		open: t("workspace.prOpen"),
		draft: t("workspace.prDraft"),
		merged: t("workspace.prMerged"),
		closed: t("workspace.prClosed"),
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-ds-3 shrink-0 ${styles[state]}`}
		>
			{labels[state]}
		</span>
	);
}
