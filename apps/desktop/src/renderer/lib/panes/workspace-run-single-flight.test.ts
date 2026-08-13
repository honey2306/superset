import { describe, expect, test } from "bun:test";
import { createWorkspaceRunSingleFlight } from "./workspace-run-single-flight";

describe("workspace run single flight", () => {
	test("rejects concurrent starts and releases after completion", () => {
		const gate = createWorkspaceRunSingleFlight();
		expect(gate.tryStart()).toBe(true);
		expect(gate.tryStart()).toBe(false);
		expect(gate.isActive()).toBe(true);
		gate.finish();
		expect(gate.tryStart()).toBe(true);
	});
});
