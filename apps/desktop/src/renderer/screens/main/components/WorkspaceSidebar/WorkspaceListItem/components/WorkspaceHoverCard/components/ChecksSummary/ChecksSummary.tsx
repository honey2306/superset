import type { CheckItem } from "@superset/shared/desktop-types";
import { LuCheck, LuLoaderCircle, LuX } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import { STROKE_WIDTH } from "../../../../../constants";

interface ChecksSummaryProps {
	checks: CheckItem[];
	status: "success" | "failure" | "pending" | "none";
}

export function ChecksSummary({ checks, status }: ChecksSummaryProps) {
	const { t } = useTranslation();
	if (status === "none") return null;

	const passing = checks.filter((c) => c.status === "success").length;
	const total = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	).length;

	const config = {
		success: {
			icon: LuCheck,
			className: "text-success",
		},
		failure: {
			icon: LuX,
			className: "text-destructive",
		},
		pending: {
			icon: LuLoaderCircle,
			className: "text-warning",
		},
	};

	const { icon: Icon, className } = config[status];
	const label =
		total > 0
			? t("workspace.checkCount", { passing, total })
			: t("workspace.checks");

	return (
		<span className={`flex items-center gap-1 ${className}`}>
			<Icon
				className={`size-3 ${status === "pending" ? "animate-spin" : ""}`}
				strokeWidth={STROKE_WIDTH}
			/>
			<span>{label}</span>
		</span>
	);
}
