export interface RelativeTimeLabels {
	now: string;
	second: string;
	minute: string;
	hour: string;
	day: string;
	month: string;
}

const DEFAULT_LABELS: RelativeTimeLabels = {
	now: "now",
	second: "s",
	minute: "m",
	hour: "h",
	day: "d",
	month: "mo",
};

export function formatRelativeTime(
	timestamp: number,
	labels: RelativeTimeLabels = DEFAULT_LABELS,
): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);
	const diffMonths = Math.floor(diffDays / 30);

	if (diffSeconds < 5) return labels.now;
	if (diffMinutes < 1) return `${diffSeconds}${labels.second}`;
	if (diffMinutes < 60) return `${diffMinutes}${labels.minute}`;
	if (diffHours < 24) return `${diffHours}${labels.hour}`;
	if (diffDays < 30) return `${diffDays}${labels.day}`;
	return `${diffMonths}${labels.month}`;
}
