import { describe, expect, test } from "bun:test";
import type { ToolCallItem } from "@superset/session-protocol";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCallRow } from "./ToolCallRow";

function tool(id: string): ToolCallItem {
	return {
		kind: "tool_call",
		id,
		call: {
			toolCallId: id,
			title: "Read",
			kind: "read",
			status: "completed",
			locations: [],
		},
		semantics: { kind: "tool" },
		permissions: [],
		children: [],
		startSeq: 1,
		endSeq: 1,
	};
}

function subagent(children: ToolCallItem[]): ToolCallItem {
	return {
		...tool("delegate-1"),
		call: {
			...tool("delegate-1").call,
			title: "provider-specific title",
			kind: "other",
		},
		semantics: {
			kind: "subagent",
			task: "Inspect repository",
			agentType: "scout",
			result: [],
		},
		children,
	};
}

describe("ToolCallRow canonical semantics", () => {
	test.each([
		["flat", subagent([])],
		["nested", subagent([tool("read-1")])],
	])("renders %s delegations through the same subagent presentation", (_shape, item) => {
		const html = renderToStaticMarkup(createElement(ToolCallRow, { item }));
		expect(html).toContain('data-tool-semantics="subagent"');
		expect(html).toContain("SUBAGENT");
		expect(html).toContain("Inspect repository");
		expect(html).not.toContain("provider-specific title");
	});
});
