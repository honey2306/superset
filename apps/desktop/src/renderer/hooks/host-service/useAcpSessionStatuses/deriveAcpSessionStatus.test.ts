import { describe, expect, it } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import {
	deriveAcpSessionStatus,
	getHighestAcpSessionStatus,
} from "./deriveAcpSessionStatus";

type NotificationState = Pick<
	SessionScopedState,
	"status" | "lastStopReason" | "lastCompletedAt" | "pendingPermissions"
>;

function session(
	status: NotificationState["status"],
	overrides: Partial<NotificationState> = {},
): NotificationState {
	return {
		status,
		lastStopReason: null,
		lastCompletedAt: 200,
		pendingPermissions: [],
		...overrides,
	};
}

describe("deriveAcpSessionStatus", () => {
	it("maps active and failed lifecycle states", () => {
		expect(deriveAcpSessionStatus(session("running"))).toBe("working");
		expect(deriveAcpSessionStatus(session("starting"))).toBe("working");
		expect(deriveAcpSessionStatus(session("awaiting_permission"))).toBe(
			"permission",
		);
		expect(
			deriveAcpSessionStatus(
				session("awaiting_permission", {
					pendingPermissions: [
						{
							requestId: "ask-user",
							toolCall: {
								toolCallId: "ask-user-call",
								_meta: { claudeCode: { toolName: "AskUserQuestion" } },
							},
							options: [],
							requestedAt: 1,
						},
					],
				}),
			),
		).toBe("askuser");
		expect(deriveAcpSessionStatus(session("dead"))).toBe("failed");
	});

	it("marks a completed unseen turn ready for review", () => {
		const completed = session("idle", { lastStopReason: "end_turn" });

		expect(deriveAcpSessionStatus(completed)).toBe("review");
		expect(deriveAcpSessionStatus(completed, 100)).toBe("review");
		expect(deriveAcpSessionStatus(completed, 200)).toBe("idle");
	});

	it("does not mark a never-run idle session ready for review", () => {
		expect(
			deriveAcpSessionStatus(session("idle", { lastCompletedAt: null })),
		).toBe("idle");
	});

	it("does not retrigger review for metadata updates after completion", () => {
		const completed = session("idle", {
			lastStopReason: "end_turn",
			lastCompletedAt: 200,
		});
		expect(deriveAcpSessionStatus(completed, 200)).toBe("idle");
	});

	it("ignores completed sessions that no longer have an open ACP pane", () => {
		const statuses = new Map([
			["open-session", "idle"],
			["closed-session", "review"],
		] as const);

		expect(
			getHighestAcpSessionStatus(statuses, new Set(["open-session"])),
		).toBeNull();
		expect(
			getHighestAcpSessionStatus(statuses, new Set(["closed-session"])),
		).toBe("review");
	});

	it("preserves an unseen completion when the session is offline", () => {
		expect(
			deriveAcpSessionStatus(
				session("offline", { lastStopReason: "end_turn" }),
				100,
			),
		).toBe("review");
	});
});
