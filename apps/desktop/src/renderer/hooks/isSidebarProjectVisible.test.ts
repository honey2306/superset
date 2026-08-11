import { describe, expect, test } from "bun:test";
import { isSidebarProjectVisible } from "./isSidebarProjectVisible";

describe("isSidebarProjectVisible", () => {
	test("hides temporary projects from the regular sidebar", () => {
		expect(
			isSidebarProjectVisible({
				kind: "temporary",
				repoPath: "/tmp/arbitrary",
			}),
		).toBe(false);
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
