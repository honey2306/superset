import { describe, expect, test } from "bun:test";
import { isTemporaryProject } from "./isTemporaryProject";

describe("isTemporaryProject", () => {
	test("recognizes projects explicitly marked temporary", () => {
		expect(
			isTemporaryProject({
				kind: "temporary",
				repoPath: "/tmp/arbitrary",
			}),
		).toBe(true);
	});

	test("recognizes legacy temporary projects with POSIX paths", () => {
		expect(
			isTemporaryProject({
				kind: "repository",
				repoPath: "/Users/test/Superset/temporary",
			}),
		).toBe(true);
	});

	test("recognizes legacy temporary projects with Windows paths", () => {
		expect(
			isTemporaryProject({
				kind: "repository",
				repoPath: "C:\\Users\\test\\Superset\\temporary",
			}),
		).toBe(true);
	});

	test("does not recognize ordinary repositories as temporary", () => {
		expect(
			isTemporaryProject({
				kind: "repository",
				repoPath: "/repos/superset",
			}),
		).toBe(false);
	});
});
