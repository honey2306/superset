import { expect, test } from "bun:test";
import type { TimelineItem } from "@superset/session-protocol";
import {
	formatElapsedDuration,
	getLatestTurnStartedAt,
	getTurnDuration,
	groupTimelineTurns,
} from "./timelineTurns";

function message(
	id: string,
	role: "user" | "agent" | "thought",
	startedAt: number,
): TimelineItem {
	return {
		kind: "message",
		id,
		role,
		blocks: [{ type: "text", text: id }],
		failed: false,
		startSeq: startedAt,
		endSeq: startedAt,
		startedAt,
		updatedAt: startedAt + 100,
	};
}

function tool(
	id: string,
	startedAt: number,
	children: TimelineItem[] = [],
): TimelineItem {
	return {
		kind: "tool_call",
		id,
		call: {
			title: id,
			kind: "other",
			status: "completed",
			content: [],
			locations: [],
		},
		semantics: { kind: "generic" },
		permissions: [],
		children,
		startSeq: startedAt,
		endSeq: startedAt,
		startedAt,
		updatedAt: startedAt + 500,
	};
}

test("groups turns and summarizes nested execution details", () => {
	const turns = groupTimelineTurns([
		message("user-1", "user", 1_000),
		message("thought-1", "thought", 1_100),
		tool("tool-1", 1_200, [tool("child-tool", 1_300)]),
		message("answer-1", "agent", 2_000),
		message("user-2", "user", 3_000),
		tool("tool-2", 3_100),
		message("answer-2", "agent", 4_000),
	]);

	expect(turns).toHaveLength(2);
	const firstTurn = turns[0];
	const secondTurn = turns[1];
	if (!firstTurn || !secondTurn) throw new Error("expected two turns");
	expect(firstTurn.id).toBe("user-1");
	expect(firstTurn.toolCallCount).toBe(2);
	expect(firstTurn.messageCount).toBe(1);
	expect(firstTurn.processItems.map(({ id }) => id)).toEqual([
		"thought-1",
		"tool-1",
	]);
	expect(firstTurn.finalAgentMessage?.id).toBe("answer-1");
	expect(getLatestTurnStartedAt(turns)).toBe(3_000);
	expect(getTurnDuration(firstTurn, 10_000, false)).toBe(1_100);
	expect(getTurnDuration(secondTurn, 10_000, true)).toBe(7_000);
});

test("formats compact elapsed time", () => {
	expect(formatElapsedDuration(0)).toBe("0s");
	expect(formatElapsedDuration(65_000)).toBe("1m 5s");
	expect(formatElapsedDuration(3_665_000)).toBe("1h 1m 5s");
});
