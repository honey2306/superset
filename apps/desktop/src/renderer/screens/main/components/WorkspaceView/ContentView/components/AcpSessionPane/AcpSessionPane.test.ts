import { describe, expect, test } from "bun:test";
import type { SessionModeState } from "@superset/session-protocol";
import {
	acpSessionPaneKey,
	canReviewPlanForMode,
	shouldEnableAcpSession,
} from "./AcpSessionPane";

const planMode: SessionModeState = {
	currentModeId: "plan",
	availableModes: [
		{ id: "default", name: "Default" },
		{ id: "plan", name: "Plan" },
	],
};

const executionMode: SessionModeState = {
	currentModeId: "default",
	availableModes: [
		{ id: "default", name: "Default" },
		{ id: "plan", name: "Plan" },
	],
};

describe("ACP session connection lifecycle", () => {
	test("keys the mounted pane by backend session identity", () => {
		expect(acpSessionPaneKey("session-old")).not.toBe(
			acpSessionPaneKey("session-new"),
		);
	});

	test("uses workspace or activity retention to enable a hidden pane", () => {
		expect(
			shouldEnableAcpSession({
				isVisible: false,
				isConnectionEnabled: true,
			}),
		).toBe(true);
		expect(
			shouldEnableAcpSession({
				isVisible: false,
				isConnectionEnabled: false,
			}),
		).toBe(false);
	});

	test("keeps a visible pane enabled after activity retention expires", () => {
		expect(
			shouldEnableAcpSession({
				isVisible: true,
				isConnectionEnabled: false,
			}),
		).toBe(true);
	});
});

describe("plan review gating", () => {
	test("requires the actual ACP plan mode and no pending permission", () => {
		expect(canReviewPlanForMode(planMode, 0)).toBe(true);
		expect(canReviewPlanForMode(executionMode, 0)).toBe(false);
		expect(canReviewPlanForMode(planMode, 1)).toBe(false);
		expect(canReviewPlanForMode(null, 0)).toBe(false);
	});
});
