const BOTTOM_TOLERANCE_PX = 48;

export interface ScrollMetrics {
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
}

/** Whether a reader is close enough to the newest item to follow live updates. */
export function isNearTimelineBottom({
	scrollTop,
	clientHeight,
	scrollHeight,
}: ScrollMetrics): boolean {
	return scrollHeight - scrollTop - clientHeight <= BOTTOM_TOLERANCE_PX;
}
