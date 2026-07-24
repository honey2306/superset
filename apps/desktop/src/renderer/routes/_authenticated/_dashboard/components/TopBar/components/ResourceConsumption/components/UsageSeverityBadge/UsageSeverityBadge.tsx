import { cn } from "@superset/ui/lib/utils";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { UsageSeverity } from "../../types";

interface UsageSeverityBadgeProps {
	severity: UsageSeverity;
}

export function UsageSeverityBadge({ severity }: UsageSeverityBadgeProps) {
	const { t } = useTranslation();
	if (severity === "normal") return null;

	return (
		<span
			role="img"
			aria-label={
				severity === "high"
					? t("dashboard.highUsage")
					: t("dashboard.elevatedUsage")
			}
			className={cn(
				"h-1.5 w-1.5 shrink-0 rounded-full",
				severity === "high" ? "bg-red-500" : "bg-amber-500",
			)}
		/>
	);
}
