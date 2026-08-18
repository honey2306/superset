import { describe, expect, test } from "bun:test";
import type { ToolCallUpdate } from "@superset/session-protocol";
import { piExtensionUiPermissionPresentation } from "./pi-extension-ui";

function toolCall(
	method: string,
	toolCallId = "pi-ui-request-1",
): ToolCallUpdate {
	return {
		toolCallId,
		title: "Pi extension prompt",
		kind: "other",
		status: "pending",
		rawInput: { method },
	};
}

describe("piExtensionUiPermissionPresentation", () => {
	test("renders text inputs and editors as free-text elicitation cards", () => {
		for (const method of ["input", "editor"]) {
			expect(
				piExtensionUiPermissionPresentation("pi-acp", toolCall(method)),
			).toEqual({ isElicitation: true, allowsCustomResponse: true });
		}
	});

	test("renders selects and confirms as choice elicitation cards", () => {
		for (const method of ["select", "confirm"]) {
			expect(
				piExtensionUiPermissionPresentation("pi-acp", toolCall(method)),
			).toEqual({ isElicitation: true });
		}
	});

	test("does not reclassify ordinary tools, other harnesses, or display-only UI", () => {
		expect(
			piExtensionUiPermissionPresentation(
				"pi-acp",
				toolCall("input", "ordinary-tool"),
			),
		).toBeNull();
		expect(
			piExtensionUiPermissionPresentation(
				"claude-agent-acp",
				toolCall("input"),
			),
		).toBeNull();
		expect(
			piExtensionUiPermissionPresentation("pi-acp", toolCall("setWidget")),
		).toBeNull();
	});
});
