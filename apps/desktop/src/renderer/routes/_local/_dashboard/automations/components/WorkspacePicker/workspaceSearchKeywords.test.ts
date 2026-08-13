import { describe, expect, it } from "bun:test";
import { getWorkspaceSearchKeywords } from "./workspaceSearchKeywords";

describe("getWorkspaceSearchKeywords", () => {
	it("indexes the visible branch for workspaces sharing a name", () => {
		expect(
			getWorkspaceSearchKeywords({
				branch: "feat/acp-agent-control-plane",
			}),
		).toContain("feat/acp-agent-control-plane");
	});
});
