import { describe, expect, test } from "bun:test";
import { isSidebarProjectVisible } from "./isSidebarProjectVisible";

describe("isSidebarProjectVisible", () => {
	test("hides temporary projects from the regular sidebar", () => {
		expect(isSidebarProjectVisible({ kind: "temporary" })).toBe(false);
	});

	test("keeps repository projects in the regular sidebar", () => {
		expect(isSidebarProjectVisible({ kind: "repository" })).toBe(true);
	});
});
