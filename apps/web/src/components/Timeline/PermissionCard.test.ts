import { expect, test } from "bun:test";
import {
	getPermissionOptionLabel,
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
