import type { SessionScopedState } from "@superset/session-protocol";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";

export type AcpSessionNotificationState = Pick<
	SessionScopedState,
	"status" | "lastStopReason" | "lastCompletedAt"
>;

/**
 * Derive the user-facing status from host-owned ACP lifecycle state and the
 * last completion timestamp acknowledged by this renderer.
 */
export function getHighestAcpSessionStatus(
	statuses: ReadonlyMap<string, PaneStatus>,
	openSessionIds?: ReadonlySet<string>,
): ActivePaneStatus | null {
	return getHighestPriorityStatus(
		[...statuses].flatMap(([sessionId, status]) =>
			!openSessionIds || openSessionIds.has(sessionId) ? [status] : [],
		),
	);
}

export function deriveAcpSessionStatus(
	session: AcpSessionNotificationState,
	lastSeenAt?: number,
): PaneStatus {
	switch (session.status) {
		case "starting":
		case "running":
			return "working";
		case "awaiting_permission":
			return "permission";
		case "dead":
			return "failed";
		case "idle":
		case "offline":
			return session.lastStopReason !== null &&
				(session.lastCompletedAt ?? 0) > (lastSeenAt ?? 0)
				? "review"
				: "idle";
	}
}
