import { hostServiceTrpc } from "renderer/lib/host-service-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

const REFRESH_INTERVAL_MS = 60_000;
const STALE_MS = 30_000;

function formatResetTime(resetsAt: number): string {
	const date = new Date(resetsAt * 1000);
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function levelForRemaining(remaining: number): "crit" | "high" | "mid" | "low" {
	if (remaining <= 10) return "crit";
	if (remaining <= 20) return "high";
	if (remaining <= 50) return "mid";
	return "low";
}

const LEVEL_CLASS: Record<ReturnType<typeof levelForRemaining>, string> = {
	crit: "text-destructive dark:text-destructive",
	high: "text-warning dark:text-warning",
	mid: "text-warning dark:text-warning",
	low: "text-fg-mute",
};

export function OpenAIUsageBadge() {
	const { t } = useTranslation();
	const { data } = hostServiceTrpc.usage.getCodex.useQuery(undefined, {
		refetchInterval: REFRESH_INTERVAL_MS,
		staleTime: STALE_MS,
		refetchOnWindowFocus: true,
	});

	if (!data || data.available !== true) return null;

	const remaining = Math.max(0, Math.round(100 - data.primary.usedPercent));
	const level = levelForRemaining(remaining);
	const resetLabel = formatResetTime(data.primary.resetsAt);
	const tooltip = [
		t("topBar.codexUsage.tooltip", {
			percent: remaining,
			reset: resetLabel,
		}),
		data.planType ? t("topBar.codexUsage.plan", { plan: data.planType }) : null,
		data.credits.hasCredits && data.credits.balance !== "0"
			? t("topBar.codexUsage.credits", { balance: data.credits.balance })
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<output
			className={`no-drag flex items-center rounded bg-hover px-2 py-1 text-xs ${LEVEL_CLASS[level]}`}
			title={tooltip}
			data-level={level}
			aria-label={tooltip}
		>
			<span className="tabular-nums">{remaining}%</span>
		</output>
	);
}
