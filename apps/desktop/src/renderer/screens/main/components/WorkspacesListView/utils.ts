// Time unit constants (in milliseconds)
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

// Time threshold constants (in their respective units)
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

// Relative time display thresholds (in days)
const TWO_WEEKS_DAYS = 14;
const TWO_MONTHS_DAYS = 60;

/** Localizable labels for the "default" (long-form) relative time format. */
export interface RelativeTimeDefaultLabels {
	now: string;
	minutesAgo: (count: number) => string;
	hoursAgo: (count: number) => string;
	yesterday: string;
	daysAgo: (count: number) => string;
	oneWeekAgo: string;
	weeksAgo: (count: number) => string;
	oneMonthAgo: string;
	monthsAgo: (count: number) => string;
	overYearAgo: string;
}

/** Localizable labels for the "compact" relative time format. */
export interface RelativeTimeCompactLabels {
	now: string;
	minutesAgo: (count: number) => string;
	hoursAgo: (count: number) => string;
	daysAgo: (count: number) => string;
	weeksAgo: (count: number) => string;
	monthsAgo: (count: number) => string;
	yearsAgo: (count: number) => string;
}

interface GetRelativeTimeOptions {
	format?: "default" | "compact";
	labels?: RelativeTimeDefaultLabels | RelativeTimeCompactLabels;
}

/** Fallback English labels (used when no caller-supplied labels are provided). */
const DEFAULT_LABELS: RelativeTimeDefaultLabels = {
	now: "just now",
	minutesAgo: (count) => `${count}m ago`,
	hoursAgo: (count) => `${count}h ago`,
	yesterday: "yesterday",
	daysAgo: (count) => `${count} days ago`,
	oneWeekAgo: "1 week ago",
	weeksAgo: (count) => `${count} weeks ago`,
	oneMonthAgo: "1 month ago",
	monthsAgo: (count) => `${count} months ago`,
	overYearAgo: "over a year ago",
};

const COMPACT_LABELS: RelativeTimeCompactLabels = {
	now: "now",
	minutesAgo: (count) => `${count}m ago`,
	hoursAgo: (count) => `${count}h ago`,
	daysAgo: (count) => `${count}d ago`,
	weeksAgo: (count) => `${count}w ago`,
	monthsAgo: (count) => `${count}mo ago`,
	yearsAgo: (count) => `${count}y ago`,
};

/**
 * Returns a human-readable relative time string
 * e.g., "2 hours ago", "yesterday", "3 days ago"
 */
export function getRelativeTime(
	timestamp: number,
	options?: GetRelativeTimeOptions,
): string {
	const format = options?.format ?? "default";
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / MS_PER_MINUTE);
	const hours = Math.floor(diff / MS_PER_HOUR);
	const days = Math.floor(diff / MS_PER_DAY);

	if (format === "compact") {
		const labels =
			(options?.labels as RelativeTimeCompactLabels | undefined) ??
			COMPACT_LABELS;
		if (minutes < 1) return labels.now;
		if (minutes < MINUTES_PER_HOUR) return labels.minutesAgo(minutes);
		if (hours < HOURS_PER_DAY) return labels.hoursAgo(hours);
		if (days < DAYS_PER_WEEK) return labels.daysAgo(days);
		if (days < DAYS_PER_MONTH)
			return labels.weeksAgo(Math.floor(days / DAYS_PER_WEEK));
		if (days < DAYS_PER_YEAR)
			return labels.monthsAgo(Math.floor(days / DAYS_PER_MONTH));
		return labels.yearsAgo(Math.floor(days / DAYS_PER_YEAR));
	}

	const labels =
		(options?.labels as RelativeTimeDefaultLabels | undefined) ??
		DEFAULT_LABELS;
	if (minutes < 1) return labels.now;
	if (minutes < MINUTES_PER_HOUR) return labels.minutesAgo(minutes);
	if (hours < HOURS_PER_DAY) return labels.hoursAgo(hours);
	if (days === 1) return labels.yesterday;
	if (days < DAYS_PER_WEEK) return labels.daysAgo(days);
	if (days < TWO_WEEKS_DAYS) return labels.oneWeekAgo;
	if (days < DAYS_PER_MONTH)
		return labels.weeksAgo(Math.floor(days / DAYS_PER_WEEK));
	if (days < TWO_MONTHS_DAYS) return labels.oneMonthAgo;
	if (days < DAYS_PER_YEAR)
		return labels.monthsAgo(Math.floor(days / DAYS_PER_MONTH));
	return labels.overYearAgo;
}
