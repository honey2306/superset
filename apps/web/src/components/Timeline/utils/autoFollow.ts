// Keep a small allowance for fractional layout pixels without treating an
// intentional upward swipe as permission to snap back on the next stream chunk.
const BOTTOM_TOLERANCE_PX = 8;

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
