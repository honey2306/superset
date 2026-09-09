import { describe, expect, test } from "bun:test";
import type { MessageItem, TimelineItem } from "@superset/session-protocol";
import {
	contextCompactionPhaseFromText,
	isContextCompacting,
	isContextCompactionNotice,
} from "./contextCompaction";

function message(
	sequence: number,
	role: MessageItem["role"],
	text: string,
): MessageItem {
	return {
		kind: "message",
		id: `${role}:${sequence}`,
		role,
		blocks: [{ type: "text", text }],
		failed: false,
		startSeq: sequence,
		endSeq: sequence,
	};
}

describe("context compaction lifecycle", () => {
	test.each([
		["Claude", "Compacting..."],
		["Pi", "Context nearing limit, running automatic compaction..."],
		["Codex", "Compacting context..."],
	])("recognizes %s start output", (_agent, text) => {
		expect(contextCompactionPhaseFromText(text)).toBe("compacting");
	});

	test.each([
		"Compacting...\n\nCompacting completed.",
		"Automatic compaction finished; context was summarized to continue the session.",
		"Context compacted.",
	])("recognizes completion output: %s", (text) => {
		expect(contextCompactionPhaseFromText(text)).toBe("completed");
	});

	test("recognizes a failed compaction", () => {
		expect(
			contextCompactionPhaseFromText("Compacting failed: unavailable"),
		).toBe("failed");
	});

	test("uses the manual ACP command as a provider-neutral fallback", () => {
		const items: TimelineItem[] = [
			message(1, "user", "/compact keep the implementation details"),
		];
		expect(isContextCompacting(items, "running")).toBe(true);
	});

	test("clears the active notice after completion or when the turn stops", () => {
		const started = message(1, "agent", "Compacting...");
		const completed = message(2, "agent", "Context compacted.");
		expect(isContextCompacting([started, completed], "running")).toBe(false);
		expect(isContextCompacting([started], "idle")).toBe(false);
	});

	test("does not reactivate a historical notice in a later turn", () => {
		const items: TimelineItem[] = [
			message(1, "user", "/compact"),
			message(2, "agent", "Compacting..."),
			message(3, "user", "Now implement the feature"),
		];
		expect(isContextCompacting(items, "running")).toBe(false);
	});

	test("does not classify ordinary discussion about compact code", () => {
		expect(
			contextCompactionPhaseFromText(
				"I changed the component to use a more compact layout.",
			),
		).toBeNull();
	});
});

describe("compaction notice visibility", () => {
	test("hides standalone agent progress notices", () => {
		expect(
			isContextCompactionNotice(
				message(
					1,
					"agent",
					"Context nearing limit, running automatic compaction...",
				),
			),
		).toBe(true);
	});
	test("preserves user text, failures, completion and substantive output", () => {
		for (const item of [
			message(1, "user", "Compacting context..."),
			message(2, "agent", "Compacting failed: unavailable"),
			message(3, "agent", "Context compacted."),
			message(4, "agent", "Compacting context...\nHere is the summary."),
			{ ...message(5, "agent", "Compacting context..."), failed: true },
		])
			expect(isContextCompactionNotice(item)).toBe(false);
	});
});
