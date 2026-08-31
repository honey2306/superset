import { expect, test } from "bun:test";
import type { PlanItem, TimelineItem } from "@superset/session-protocol";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getLatestActivePlan,
	getPlanProgress,
	MobilePlanDetails,
} from "./MobilePlanPanel";

function plan(
	id: string,
	statuses: PlanItem["entries"][number]["status"][],
): PlanItem {
	return {
		kind: "plan",
		id,
		removed: false,
		startSeq: 1,
		endSeq: 2,
		entries: statuses.map((status, index) => ({
			content: `Step ${index + 1}`,
			status,
		})),
	};
}

test("uses only the newest non-removed plan snapshot", () => {
	const active = plan("active", ["completed", "in_progress", "pending"]);
	const removed = { ...plan("removed", ["pending"]), removed: true };
	expect(
		getLatestActivePlan([active, removed] satisfies TimelineItem[])?.id,
	).toBe("active");
	const completed = plan("completed", ["completed", "completed"]);
	expect(
		getLatestActivePlan([active, completed] satisfies TimelineItem[]),
	).toBeNull();
});

test("calculates progress and names the current numbered step", () => {
	const item = plan("active", [
		"completed",
		"completed",
		"in_progress",
		"pending",
	]);
	expect(getPlanProgress(item)).toEqual({
		completed: 2,
		active: 1,
		total: 4,
		percent: 63,
		summary: "Step 3",
	});
	const markup = renderToStaticMarkup(
		createElement(MobilePlanDetails, { plan: item }),
	);
	expect(markup).toContain("Step 1");
	expect(markup).toContain("Step 3");
	expect(markup).toContain('data-status="in_progress"');
	expect(markup).toContain(">4<");
});
