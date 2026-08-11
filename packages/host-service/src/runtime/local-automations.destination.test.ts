import { describe, expect, test } from "bun:test";
import {
	automatedAgentRunInput,
	localRunDestination,
} from "./local-automations";

describe("localRunDestination", () => {
	test("keeps the workspace and concrete session needed by run-now clients", () => {
		expect(
			localRunDestination("workspace-1", {
				kind: "terminal",
				sessionId: "terminal-1",
			}),
		).toEqual({
			workspaceId: "workspace-1",
			sessionKind: "terminal",
			sessionId: "terminal-1",
		});
	});
});

describe("automatedAgentRunInput", () => {
	test("marks unattended automation and auto-todo launches as full access", () => {
		expect(automatedAgentRunInput("workspace-1", "myflicker", "do it")).toEqual(
			{
				workspaceId: "workspace-1",
				agent: "myflicker",
				prompt: "do it",
				permissionMode: "full_access",
			},
		);
	});
});
