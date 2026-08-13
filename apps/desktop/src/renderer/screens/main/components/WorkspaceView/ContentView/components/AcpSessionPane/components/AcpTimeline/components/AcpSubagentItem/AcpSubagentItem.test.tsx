import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { ToolCallItem } from "@superset/session-protocol";
import { type ComponentProps, createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import {
	type AcpSubagentItem as AcpSubagentItemComponent,
	getSubagentActivitySummary,
	getSubagentPresentationStatus,
	subagentType,
} from "./AcpSubagentItem";

let AcpSubagentItem: typeof AcpSubagentItemComponent;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, fireEvent, render, screen } = await import(
		"@testing-library/react/pure"
	));
	({ AcpSubagentItem } = await import("./AcpSubagentItem"));
});

afterEach(() => {
	cleanup();
});

function tool(
	id: string,
	status: "completed" | "failed" | "in_progress" | "pending",
	children: ToolCallItem[] = [],
): ToolCallItem {
	return {
		kind: "tool_call",
		id,
		call: {
			toolCallId: id,
			title: id,
			kind: "other",
			status,
			locations: [],
		},
		permissions: [],
		children,
		startSeq: 1,
		endSeq: 1,
	};
}

function subagent(
	status: "completed" | "failed" | "in_progress" | "pending" = "in_progress",
): ToolCallItem {
	return {
		...tool("task-1", status, [
			tool("read-1", "completed"),
			tool("bash-1", status === "completed" ? "completed" : "in_progress"),
		]),
		call: {
			toolCallId: "task-1",
			title: "Inspect the ACP lifecycle",
			kind: "other",
			status,
			locations: [],
			rawInput: { subagent_type: "Explore" },
		},
	};
}

function renderSubagent(item: ToolCallItem) {
	const props: ComponentProps<typeof AcpSubagentItemComponent> = {
		item,
		renderChild: (child) => createElement("span", null, child.id),
	};
	return render(createElement(AcpSubagentItem, props));
}

describe("subagent presentation", () => {
	test("aggregates recursive child activity and adapter-provided agent type", () => {
		const nested = tool("nested-task", "in_progress", [
			tool("nested-read", "completed"),
		]);
		const item = subagent();
		item.children.push(nested);

		expect(getSubagentActivitySummary(item)).toEqual({
			total: 4,
			completed: 2,
			active: 2,
		});
		expect(subagentType(item)).toBe("Explore");
	});

	test("uses the parent result when a completed subagent recovered from a failed tool", () => {
		const item = subagent("completed");
		const child = item.children[0];
		if (!child || child.kind !== "tool_call") {
			throw new Error("expected child tool");
		}
		child.call.status = "failed";

		expect(getSubagentPresentationStatus(item)).toBe("completed");
	});

	test("surfaces a nested permission on the parent card", () => {
		const item = subagent();
		const child = item.children[1];
		if (!child || child.kind !== "tool_call") {
			throw new Error("expected child tool");
		}
		child.permissions.push({
			requestId: "permission-1",
			options: [],
			requestedAt: 1,
			resolution: null,
		});

		expect(getSubagentPresentationStatus(item)).toBe("awaiting_approval");
	});

	test("expands active work and collapses completed work by default", () => {
		const result = renderSubagent(subagent());
		const header = screen.getByRole("button", { name: /SUBAGENT/ });
		expect(header.getAttribute("aria-expanded")).toBe("true");

		result.rerender(
			createElement(AcpSubagentItem, {
				item: { ...subagent("completed"), endSeq: 2 },
				renderChild: (child) => createElement("span", null, child.id),
			}),
		);
		expect(header.getAttribute("aria-expanded")).toBe("false");
	});

	test("does not steal a manual collapsed state and counts later activity", () => {
		const initial = subagent();
		const result = renderSubagent(initial);
		const header = screen.getByRole("button", { name: /SUBAGENT/ });
		fireEvent.click(header);
		expect(header.getAttribute("aria-expanded")).toBe("false");

		result.rerender(
			createElement(AcpSubagentItem, {
				item: { ...initial, endSeq: 2 },
				renderChild: (child) => createElement("span", null, child.id),
			}),
		);

		expect(header.getAttribute("aria-expanded")).toBe("false");
		expect(screen.getByText("+1")).toBeTruthy();
	});
});
