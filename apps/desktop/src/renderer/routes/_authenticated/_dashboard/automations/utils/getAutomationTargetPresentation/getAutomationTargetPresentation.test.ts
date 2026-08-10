import { describe, expect, test } from "bun:test";
import { getAutomationTargetPresentation } from "./getAutomationTargetPresentation";

describe("getAutomationTargetPresentation", () => {
	test("does not present a temporary target as a new workspace", () => {
		expect(
			getAutomationTargetPresentation({
				isTemporaryTarget: true,
				workspaceId: null,
				workspaceName: null,
				newWorkspaceLabel: "New workspace",
				deletedWorkspaceLabel: "Deleted workspace",
			}),
		).toEqual({ isTemporaryTarget: true, workspaceLabel: "—" });
	});
});
