import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	AcpPermissionCard,
	approvalDetail,
	buildPermissionOutcome,
	isAskUserPermission,
	mergePermissionToolCall,
} from "./AcpPermissionCard";

describe("approvalDetail", () => {
	test("recovers AskUser treatment from a persisted source tool call", () => {
		expect(
			isAskUserPermission(
				{ isElicitation: undefined },
				{
					toolCallId: "toolu_ask",
					_meta: { claudeCode: { toolName: "AskUserQuestion" } },
				},
			),
		).toBe(true);
	});

	test("does not classify an ordinary permission from options or title", () => {
		expect(
			isAskUserPermission(
				{ isElicitation: undefined },
				{ toolCallId: "tool-ordinary", title: "Ask a question" },
			),
		).toBe(false);
	});

	test("shows the concrete execute command", () => {
		expect(
			approvalDetail({
				toolCallId: "bash-1",
				title: "bash",
				kind: "execute",
				rawInput: { command: "bun run typecheck" },
			}),
		).toBe("bun run typecheck");
	});

	test("includes execute arguments instead of showing only bash", () => {
		expect(
			approvalDetail({
				toolCallId: "bash-2",
				title: "bash",
				kind: "execute",
				rawInput: { command: "bash", args: ["-lc", "bun run test"] },
			}),
		).toBe("bash -lc bun run test");
	});

	test("shows structured input for non-execute approvals", () => {
		expect(
			approvalDetail({
				toolCallId: "edit-1",
				title: "Edit file",
				kind: "edit",
				rawInput: { file_path: "src/index.ts", operation: "write" },
			}),
		).toBe('{\n  "file_path": "src/index.ts",\n  "operation": "write"\n}');
	});

	test("fills missing permission input from the timeline tool call", () => {
		expect(
			mergePermissionToolCall(
				{
					toolCallId: "bash-3",
					title: "bash",
					kind: "execute",
					status: "pending",
				},
				{
					toolCallId: "bash-3",
					title: "bun run lint",
					kind: "execute",
					rawInput: { command: "bun run lint" },
				},
			)?.rawInput,
		).toEqual({ command: "bun run lint" });
	});
});

describe("buildPermissionOutcome", () => {
	test("single-select: returns selected outcome with single optionId", () => {
		const outcome = buildPermissionOutcome({
			selectedIds: ["opt-1"],
			multiSelect: false,
		});
		expect(outcome).toEqual({ outcome: "selected", optionId: "opt-1" });
	});

	test("multi-select single pick: returns selected outcome with optionId", () => {
		const outcome = buildPermissionOutcome({
			selectedIds: ["opt-1"],
			multiSelect: true,
		});
		expect(outcome.outcome).toBe("selected");
		if (outcome.outcome === "selected") {
			expect(outcome.optionId).toBe("opt-1");
		}
	});

	test("multi-select multiple picks: returns selected outcome with all ids in _meta", () => {
		const outcome = buildPermissionOutcome({
			selectedIds: ["opt-1", "opt-2"],
			multiSelect: true,
		});
		expect(outcome.outcome).toBe("selected");
		if (outcome.outcome === "selected") {
			expect(outcome.optionId).toBe("opt-1");
			const meta = outcome._meta as Record<string, unknown> | undefined;
			const ids = meta?.["sh.superset/selectedOptionIds"];
			expect(ids).toEqual(["opt-1", "opt-2"]);
		}
	});

	test("single-select ignores extra ids beyond first", () => {
		const outcome = buildPermissionOutcome({
			selectedIds: ["opt-1", "opt-2"],
			multiSelect: false,
		});
		expect(outcome.outcome).toBe("selected");
		if (outcome.outcome === "selected") {
			expect(outcome.optionId).toBe("opt-1");
		}
	});
});

describe("AcpPermissionCard", () => {
	test("renders resolved multi-select AskUser history as all answered choices", () => {
		const markup = renderToStaticMarkup(
			createElement(AcpPermissionCard, {
				permission: {
					requestId: "ask-scope-resolved",
					multiSelect: true,
					options: [
						{ optionId: "source", name: "Source files", kind: "allow_once" },
						{ optionId: "tests", name: "Tests", kind: "allow_once" },
					],
					requestedAt: 0,
					resolution: buildPermissionOutcome({
						selectedIds: ["source", "tests"],
						multiSelect: true,
					}),
				},
				variant: "askuser",
				onRespond: async () => undefined,
			}),
		);

		expect(markup).toContain("AskUser ·");
		expect(markup).toContain("Answered: Source files, Tests");
		expect(markup).toContain('data-variant="askuser"');
		expect(markup).toContain('aria-hidden="true">✓</span>');
		expect(markup).not.toContain("Permission ·");
	});

	test("keeps ordinary resolved approvals labelled as permissions", () => {
		const markup = renderToStaticMarkup(
			createElement(AcpPermissionCard, {
				permission: {
					requestId: "permission-resolved",
					options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
					requestedAt: 0,
					resolution: { outcome: "selected", optionId: "allow" },
				},
				onRespond: async () => undefined,
			}),
		);

		expect(markup).toContain("Permission ·");
		expect(markup).toContain(">Allow<");
	});

	test("renders an AskUser question from the merged tool title before its choices", () => {
		const markup = renderToStaticMarkup(
			createElement(AcpPermissionCard, {
				permission: {
					requestId: "ask-color",
					options: [{ optionId: "blue", name: "Blue", kind: "allow_once" }],
					requestedAt: 0,
					resolution: null,
				},
				sourceToolCall: {
					toolCallId: "ask-color",
					title: "Which color should I use?",
				},
				variant: "askuser",
				onRespond: async () => undefined,
			}),
		);

		const questionIndex = markup.indexOf("Which color should I use?");
		const choiceIndex = markup.indexOf(">Blue<");
		expect(markup).toContain(
			'class="acp-perm__question select-text cursor-text"',
		);
		expect(questionIndex).toBeGreaterThan(-1);
		expect(choiceIndex).toBeGreaterThan(questionIndex);
	});

	test("renders multi-select options as clickable custom checkbox rows", () => {
		const markup = renderToStaticMarkup(
			createElement(AcpPermissionCard, {
				permission: {
					requestId: "ask-scope",
					multiSelect: true,
					options: [
						{ optionId: "source", name: "Source files", kind: "allow_once" },
						{ optionId: "skip", name: "Skip", kind: "reject_once" },
					],
					requestedAt: 0,
					resolution: null,
				},
				variant: "askuser",
				onRespond: async () => undefined,
			}),
		);

		expect(markup).toContain('class="acp-perm__multi-item"');
		expect(markup).toContain(
			'class="acp-perm__multi-indicator" aria-hidden="true"',
		);
		expect(markup).toContain('type="checkbox"');
		expect(markup.match(/type="checkbox"/g)).toHaveLength(1);
		expect(markup).toContain('data-selected="false"');
		expect(markup).toContain('data-variant="ghost"');
		expect(markup).toContain(">Skip<");
		expect(markup.indexOf(">Skip<")).toBeGreaterThan(
			markup.indexOf(">Done (0)<"),
		);
		expect(markup).toContain('disabled=""');
	});
});
