import { expect, test } from "bun:test";
import type { TimelineItem } from "@superset/session-protocol";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineTurn as TimelineTurnModel } from "../../utils/timelineTurns";
import { TimelineTurn } from "./TimelineTurn";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;

function message(
	id: string,
	role: MessageItem["role"],
	text: string,
): MessageItem {
	return {
		kind: "message",
		id,
		role,
		blocks: [{ type: "text", text }],
		failed: false,
		startSeq: 1,
		endSeq: 1,
		startedAt: 1,
		updatedAt: 2,
	};
}

function renderTurn(expanded: boolean): string {
	const turn: TimelineTurnModel = {
		id: "user-1",
		preItems: [message("user-1", "user", "User question")],
		processItems: [message("thought-1", "thought", "Private reasoning")],
		finalAgentMessage: message("agent-1", "agent", "Final answer"),
		trailingItems: [],
		toolCallCount: 0,
		messageCount: 1,
		startedAt: 1,
		endedAt: 2,
	};
	return renderToStaticMarkup(
		createElement(TimelineTurn, {
			turn,
			duration: "1s",
			expanded,
			onToggle: () => {},
		}),
	);
}

test("keeps thought messages inside the collapsed execution summary", () => {
	const html = renderTurn(false);
	expect(html).toContain("User question");
	expect(html).toContain("Execution:");
	expect(html).toContain("Final answer");
	expect(html).not.toContain("Private reasoning");
});

test("shows thought messages when execution details are expanded", () => {
	expect(renderTurn(true)).toContain("Private reasoning");
});
