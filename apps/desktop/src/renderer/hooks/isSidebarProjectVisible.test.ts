import { describe, expect, test } from "bun:test";
import { isSidebarProjectVisible } from "./isSidebarProjectVisible";

describe("isSidebarProjectVisible", () => {
	test("shows current temporary projects so active conversation workspaces remain discoverable", () => {
		expect(
			isSidebarProjectVisible({
				kind: "temporary",
				repoPath: "/tmp/arbitrary",
			}),
		).toBe(true);
	});

	test("hides legacy temporary repositories from the regular sidebar", () => {
		expect(
			isSidebarProjectVisible({
				kind: "repository",
				repoPath: "C:\\Users\\test\\Superset\\temporary",
			}),
		).toBe(false);
	});

	test("keeps repository projects in the regular sidebar", () => {
		expect(
			isSidebarProjectVisible({
				kind: "repository",
				repoPath: "/repos/superset",
			}),
		).toBe(true);
	});
});
