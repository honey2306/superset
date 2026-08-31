import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getApprovalPlan,
	getPermissionOptionLabel,
	getPermissionOptionPresentation,
	getPermissionRequestLabel,
	isMultiSelectPermission,
	PermissionCard,
} from "./PermissionCard";

test("uses the ACP-supplied option name instead of assuming allow or reject", () => {
	expect(
		getPermissionOptionLabel({
			optionId: "yes",
			name: "Continue",
			kind: "other",
		}),
	).toBe("Continue");
	expect(
		getPermissionOptionLabel({ optionId: "fallback", kind: "other" }),
	).toBe("fallback");
});

test("keeps a single-choice elicitation single-choice", () => {
	expect(
		isMultiSelectPermission({
			isElicitation: true,
			multiSelect: false,
		} as never),
	).toBe(false);
});

test("uses question language for AskUser cards", () => {
	expect(
		getPermissionRequestLabel({
			isElicitation: true,
			toolCall: { title: "Pick a color", kind: "other" },
		} as never),
	).toBe("Question: Pick a color");
});

test("keeps approval language for ordinary permission cards", () => {
	expect(
		getPermissionRequestLabel({
			toolCall: { title: "Bash", kind: "execute" },
		} as never),
	).toBe("Permission requested: Bash");
});

test("splits AskUser option descriptions for the mobile choice rows", () => {
	expect(
		getPermissionOptionPresentation({
			optionId: "compact",
			name: "Compact dock — Keeps the conversation visible",
			kind: "allow_once",
		}),
	).toEqual({
		label: "Compact dock",
		description: "Keeps the conversation visible",
	});
});

test("recognizes ExitPlanMode markdown and labels its compact dock", () => {
	const toolCall = {
		toolCallId: "exit-plan",
		title: "ExitPlanMode",
		kind: "other",
		status: "pending",
		rawInput: {
			plan: "# Implementation\n\n1. First step",
			planFilePath: "/tmp/plan.md",
		},
	} as never;
	expect(getApprovalPlan(toolCall)).toContain("# Implementation");
	const markup = renderToStaticMarkup(
		createElement(PermissionCard, {
			pending: {
				requestId: "permission-1",
				toolCall,
				options: [{ optionId: "approve", name: "Approve", kind: "allow_once" }],
				requestedAt: 1,
			},
			onRespond: async () => {},
		}),
	);
	expect(markup).toContain("Plan ready for review");
	expect(markup).toContain("Read the plan before choosing a response");
});
