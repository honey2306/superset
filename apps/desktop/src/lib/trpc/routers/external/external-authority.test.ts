import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("external router authority", () => {
	test("does not resolve projects or workspaces through local-db", () => {
		expect(source).not.toContain("main/lib/local-db");
		expect(source).not.toContain("workspaces/utils/db-helpers");
		expect(source).not.toContain("workspaces/utils/worktree");
		expect(source).not.toContain("@superset/local-db");
	});

	test("requires explicit absolute paths for app launches", () => {
		expect(source).toContain("nodePath.isAbsolute(input.path)");
		expect(source).toContain("openInApp requires an absolute path");
	});
});
