import { describe, expect, test } from "bun:test";
import { getAutomationRunDestination } from "./getAutomationRunDestination";

describe("getAutomationRunDestination", () => {
	test("deep-links a persisted terminal run into its workspace", () => {
		expect(
			getAutomationRunDestination({
				v2WorkspaceId: "workspace-1",
				sessionKind: "terminal",
				terminalSessionId: "terminal-1",
			}),
		).toEqual({ workspaceId: "workspace-1", terminalId: "terminal-1" });
	});

	test("returns explicit feedback instead of a no-op for unavailable runs", () => {
		expect(
			getAutomationRunDestination({
				v2WorkspaceId: "workspace-1",
				sessionKind: "chat",
				terminalSessionId: null,
			}),
		).toEqual({
			reason: "This automation chat session cannot be opened here yet.",
		});
	});
});
