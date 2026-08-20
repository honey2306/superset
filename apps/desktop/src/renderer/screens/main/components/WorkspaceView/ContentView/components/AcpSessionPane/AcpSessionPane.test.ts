import { describe, expect, test } from "bun:test";
import type { SessionModeState } from "@superset/session-protocol";
import { canReviewPlanForMode } from "./AcpSessionPane";

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

describe("plan review gating", () => {
	test("requires the actual ACP plan mode and no pending permission", () => {
		expect(canReviewPlanForMode(planMode, 0)).toBe(true);
		expect(canReviewPlanForMode(executionMode, 0)).toBe(false);
		expect(canReviewPlanForMode(planMode, 1)).toBe(false);
		expect(canReviewPlanForMode(null, 0)).toBe(false);
	});
});
