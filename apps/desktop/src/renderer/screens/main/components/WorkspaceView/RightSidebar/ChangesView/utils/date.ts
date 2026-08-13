import type { MessageKey } from "renderer/providers/I18nProvider";

export function formatRelativeDate(
	date: Date,
	t: (key: MessageKey, values?: Record<string, number | string>) => string,
): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMinutes < 1) return t("changes.date.justNow");
	if (diffMinutes < 60)
		return t("changes.date.minutesAgo", { count: diffMinutes });
	if (diffHours < 24) return t("changes.date.hoursAgo", { count: diffHours });
	if (diffDays < 7) return t("changes.date.daysAgo", { count: diffDays });
	return date.toLocaleDateString();
}
