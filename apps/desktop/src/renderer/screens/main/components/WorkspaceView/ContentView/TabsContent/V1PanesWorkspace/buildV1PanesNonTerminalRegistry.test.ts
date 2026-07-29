import { describe, expect, test } from "bun:test";
import {
	commentPaneTitle,
	devtoolsPaneTitle,
	type NonTerminalPaneTitles,
	webviewPaneTitle,
} from "./buildV1PanesNonTerminalRegistry";
import type { V1PanesPaneData } from "./types";

const labels: NonTerminalPaneTitles = {
	devtools: "DevTools",
	browser: "Browser",
};

/**
 * Contract tests for the non-terminal pane kind title derivation.
 *
 * These lock the title the panes-engine header shows for each migrated
 * kind, mirroring v1's pane-name conventions so the v2-panes-in-v1 mount
 * does not regress the header text users saw under mosaic. The pure
 * helpers are the testable core; `useV1PanesRegistry` composes them with
 * i18n labels and the React `getIcon`/`renderPane` slices.
 */
describe("buildV1PanesNonTerminalRegistry titles", () => {
	describe("commentPaneTitle", () => {
		test("returns `@<authorLogin>` when the comment payload is present", () => {
			const data: V1PanesPaneData = {
				terminalId: "t",
				comment: {
					commentId: "c1",
					authorLogin: "octocat",
					body: "looks good",
				},
			};
			expect(commentPaneTitle(data)).toBe("@octocat");
		});

		test("returns undefined when the comment payload is absent (registry falls back to pane.id)", () => {
			const data: V1PanesPaneData = { terminalId: "t" };
			expect(commentPaneTitle(data)).toBeUndefined();
		});
	});

	describe("devtoolsPaneTitle", () => {
		test("returns the injected devtools label", () => {
			expect(devtoolsPaneTitle(labels)).toBe("DevTools");
		});
	});

	describe("webviewPaneTitle", () => {
		test("returns the current history entry title when present", () => {
			const data: V1PanesPaneData = {
				terminalId: "t",
				browser: {
					currentUrl: "https://example.com/page",
					history: [
						{
							url: "https://example.com/page",
							title: "Example Page",
							timestamp: 0,
						},
					],
					historyIndex: 0,
					isLoading: false,
				},
			};
			expect(webviewPaneTitle(data, labels)).toBe("Example Page");
		});

		test("falls back to the URL host when the history entry has no title", () => {
			const data: V1PanesPaneData = {
				terminalId: "t",
				browser: {
					currentUrl: "https://example.com/page",
					history: [
						{ url: "https://example.com/page", title: "", timestamp: 0 },
					],
					historyIndex: 0,
					isLoading: false,
				},
			};
			expect(webviewPaneTitle(data, labels)).toBe("example.com");
		});

		test("falls back to the raw URL when it is not a valid URL", () => {
			const data: V1PanesPaneData = {
				terminalId: "t",
				browser: {
					currentUrl: "not-a-url",
					history: [],
					historyIndex: 0,
					isLoading: false,
				},
			};
			expect(webviewPaneTitle(data, labels)).toBe("not-a-url");
		});

		test("falls back to the browser label when currentUrl is about:blank", () => {
			const data: V1PanesPaneData = {
				terminalId: "t",
				browser: {
					currentUrl: "about:blank",
					history: [],
					historyIndex: 0,
					isLoading: false,
				},
			};
			expect(webviewPaneTitle(data, labels)).toBe("Browser");
		});

		test("falls back to the browser label when there is no browser state", () => {
			const data: V1PanesPaneData = { terminalId: "t" };
			expect(webviewPaneTitle(data, labels)).toBe("Browser");
		});
	});
});
