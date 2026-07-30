import { describe, expect, test } from "bun:test";
import { commentPaneTitle } from "./buildV1PanesNonTerminalRegistry";
import type { V1PanesPaneData } from "./types";

describe("buildV1PanesNonTerminalRegistry", () => {
	describe("commentPaneTitle", () => {
		test("returns @authorLogin when comment is present", () => {
			const data: V1PanesPaneData = {
				comment: {
					authorLogin: "alice",
					avatarUrl: "https://example.com/avatar.png",
					commentId: "comment-456",
					body: "test comment",
				},
			};
			expect(commentPaneTitle(data)).toBe("@alice");
		});

		test("returns undefined when comment is absent", () => {
			const data: V1PanesPaneData = {};
			expect(commentPaneTitle(data)).toBeUndefined();
		});
	});

	// Browser and devtools pane title tests removed for single-user setup
});
