import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoDir = resolve(import.meta.dir, "../..");

describe("desktop release workflow", () => {
	test("publishes release assets after a successful tag build", () => {
		const workflow = readFileSync(
			resolve(repoDir, ".github/workflows/release-desktop.yml"),
			"utf8",
		);

		expect(workflow).toContain("Create published release with updater assets");
		expect(workflow).toContain("gh release create");
		expect(workflow).toContain("--latest");
		expect(workflow).not.toContain("--draft");
	});
});
