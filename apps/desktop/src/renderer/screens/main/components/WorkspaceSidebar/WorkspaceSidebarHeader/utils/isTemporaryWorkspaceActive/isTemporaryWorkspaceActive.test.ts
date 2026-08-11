import { describe, expect, test } from "bun:test";
import { isTemporaryWorkspaceActive } from "./isTemporaryWorkspaceActive";

describe("isTemporaryWorkspaceActive", () => {
	test("does not activate outside a workspace route while catalog data is unresolved", () => {
		expect(isTemporaryWorkspaceActive(undefined, undefined)).toBe(false);
		expect(isTemporaryWorkspaceActive(undefined, "temporary-workspace")).toBe(
			false,
		);
	});

	test("activates only for the resolved temporary workspace route", () => {
		expect(
			isTemporaryWorkspaceActive("temporary-workspace", "temporary-workspace"),
		).toBe(true);
		expect(
			isTemporaryWorkspaceActive("repository-workspace", "temporary-workspace"),
		).toBe(false);
	});
});
