import { describe, expect, it } from "bun:test";
import { sortTimelineItems, type TimelineItem } from "./sortTimelineItems";

function item(overrides: Partial<TimelineItem> & { label: string }) {
	return {
		workspaceId: overrides.label,
		projectId: "p",
		projectName: "proj",
		branch: "main",
		status: null,
		lastActivityAt: null,
		isLive: false,
		...overrides,
	} satisfies TimelineItem;
}

describe("sortTimelineItems", () => {
	it("puts live workspaces first even when their timestamp is older", () => {
		const sorted = sortTimelineItems([
			item({ label: "just-finished", lastActivityAt: 9_000 }),
			item({
				label: "still-running",
				lastActivityAt: 1_000,
				isLive: true,
				status: "working",
			}),
		]);
		expect(sorted.map((entry) => entry.label)).toEqual([
			"still-running",
			"just-finished",
		]);
	});

	it("orders the rest by most recent activity", () => {
		const sorted = sortTimelineItems([
			item({ label: "older", lastActivityAt: 100 }),
			item({ label: "newest", lastActivityAt: 900 }),
			item({ label: "middle", lastActivityAt: 500 }),
		]);
		expect(sorted.map((entry) => entry.label)).toEqual([
			"newest",
			"middle",
			"older",
		]);
	});

	it("sinks never-run workspaces below any that have activity", () => {
		const sorted = sortTimelineItems([
			item({ label: "never-run" }),
			item({ label: "ran-long-ago", lastActivityAt: 1 }),
		]);
		expect(sorted.map((entry) => entry.label)).toEqual([
			"ran-long-ago",
			"never-run",
		]);
	});

	it("falls back to a stable name order when nothing has run", () => {
		const sorted = sortTimelineItems([
			item({ label: "beta" }),
			item({ label: "alpha" }),
		]);
		expect(sorted.map((entry) => entry.label)).toEqual(["alpha", "beta"]);
	});

	it("sorts live workspaces among themselves by recency", () => {
		const sorted = sortTimelineItems([
			item({ label: "live-old", lastActivityAt: 10, isLive: true }),
			item({ label: "live-new", lastActivityAt: 20, isLive: true }),
		]);
		expect(sorted.map((entry) => entry.label)).toEqual([
			"live-new",
			"live-old",
		]);
	});

	it("does not mutate the input", () => {
		const input = [
			item({ label: "b", lastActivityAt: 1 }),
			item({ label: "a", lastActivityAt: 2 }),
		];
		sortTimelineItems(input);
		expect(input.map((entry) => entry.label)).toEqual(["b", "a"]);
	});
});
