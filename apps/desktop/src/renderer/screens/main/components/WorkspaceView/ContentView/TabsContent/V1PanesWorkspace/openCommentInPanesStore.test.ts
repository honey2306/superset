import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { CommentPaneState } from "shared/tabs-types";
import { openCommentInPanesStore } from "./openCommentInPanesStore";
import type { V1PanesPaneData } from "./types";

const commentA: CommentPaneState = {
	commentId: "c1",
	authorLogin: "octocat",
	avatarUrl: "https://example.com/a.png",
	body: "first",
	path: "src/a.ts",
	line: 1,
};
const commentB: CommentPaneState = {
	commentId: "c2",
	authorLogin: "octocat",
	body: "second",
	path: "src/b.ts",
	line: 2,
};

/**
 * Contract tests for the panes-store comment opener.
 *
 * The opener ports v1's `openCommentPane` ("reuse the existing comment pane
 * in this workspace; else open a new tab with one") onto the panes store.
 * The registry-rendered `comment` kind reads `ctx.pane.data.comment`, so the
 * opener must seed that field and activate the pane — otherwise the
 * notification-controller "open PR review comment" flow (ReviewPanel) would
 * write the v1 global tabs store while the panes engine renders the panes
 * store, and the comment would never appear.
 */
describe("openCommentInPanesStore", () => {
	test("adds a new tab with a comment pane seeded from the payload when none exists", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		openCommentInPanesStore(store, commentA);

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe(state.tabs[0].id);
		const pane = state.tabs[0].panes[Object.keys(state.tabs[0].panes)[0] ?? ""];
		expect(pane?.kind).toBe("comment");
		expect(pane?.data.comment).toEqual(commentA);
	});

	test("reuses the existing comment pane: updates its data and activates it", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		// Seed an existing comment pane with commentA.
		openCommentInPanesStore(store, commentA);
		// Add a second (non-comment) tab so we can prove activation switches back.
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		// Sanity: the active tab is now the terminal tab.
		const before = store.getState();
		expect(before.activeTabId).toBe(before.tabs[1].id);

		// Open another comment → must reuse the existing comment pane, not
		// add a third tab.
		openCommentInPanesStore(store, commentB);

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		// The comment pane's data is updated in place.
		const commentTab = state.tabs[0];
		const commentPane =
			commentTab.panes[Object.keys(commentTab.panes)[0] ?? ""];
		expect(commentPane?.kind).toBe("comment");
		expect(commentPane?.data.comment).toEqual(commentB);
		// The comment tab is reactivated.
		expect(state.activeTabId).toBe(commentTab.id);
	});

	test("reuses the first comment pane found, scanning tabs in order", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		openCommentInPanesStore(store, commentA);
		// Add a second comment pane in a new tab.
		store.getState().addTab({
			panes: [{ kind: "comment", data: { comment: commentB } }],
		});

		// Open a third comment → the first comment pane (tab 0) is reused.
		const third: CommentPaneState = {
			commentId: "c3",
			authorLogin: "octocat",
			body: "third",
		};
		openCommentInPanesStore(store, third);

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		const firstCommentPane =
			state.tabs[0].panes[Object.keys(state.tabs[0].panes)[0] ?? ""];
		const secondCommentPane =
			state.tabs[1].panes[Object.keys(state.tabs[1].panes)[0] ?? ""];
		expect(firstCommentPane?.data.comment).toEqual(third);
		// The second comment pane is untouched.
		expect(secondCommentPane?.data.comment).toEqual(commentB);
		// First comment tab is active.
		expect(state.activeTabId).toBe(state.tabs[0].id);
	});
});
