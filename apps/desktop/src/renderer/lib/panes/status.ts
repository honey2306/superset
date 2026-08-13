import type { SessionStatus } from "@superset/session-protocol";
import type { PaneStatus } from "shared/tabs-types";

export function acpSessionStatusToPaneStatus(
	status: SessionStatus | undefined,
): PaneStatus {
	switch (status) {
		case "running":
		case "starting":
			return "working";
		case "awaiting_permission":
			return "permission";
		case "dead":
			return "failed";
		default:
			return "idle";
	}
}
