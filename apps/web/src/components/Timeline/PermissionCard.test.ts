import { expect, test } from "bun:test";
import {
	getPermissionOptionLabel,
	getPermissionRequestLabel,
	isMultiSelectPermission,
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
