import { describe, expect, test } from "bun:test";
import { canCreateAutomation } from "./canCreateAutomation";

const completeForm = {
	name: "Daily review",
	prompt: "Review open pull requests",
	projectId: "project-id",
	hostId: "host-id",
	agentId: "agent-config-id",
	rrule: "FREQ=DAILY",
	isPending: false,
};

describe("canCreateAutomation", () => {
	test("allows a complete local form", () => {
		expect(canCreateAutomation(completeForm)).toBe(true);
	});

	test.each([
		["name", ""],
		["prompt", "  "],
		["projectId", null],
		["hostId", null],
		["agentId", null],
		["rrule", ""],
		["isPending", true],
	] as const)("rejects an invalid %s", (field, value) => {
		expect(canCreateAutomation({ ...completeForm, [field]: value })).toBe(
			false,
		);
	});
});
