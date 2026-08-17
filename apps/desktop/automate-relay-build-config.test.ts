import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopDir = import.meta.dir;
const repoDir = resolve(desktopDir, "../..");

function read(relativePath: string): string {
	return readFileSync(resolve(repoDir, relativePath), "utf8");
}

describe("AutoMate relay release configuration", () => {
	test("injects the relay URL only into main and requires it in official builds", () => {
		const viteConfig = read("apps/desktop/electron.vite.config.ts");
		const workflow = read(".github/workflows/build-desktop.yml");

		expect(viteConfig).toContain('"process.env.AUTOMATE_RELAY_URL"');
		expect(viteConfig).toContain(
			"Do not add this to preload or renderer defines.",
		);
		expect(workflow).toContain(
			"AUTOMATE_RELAY_URL: $" + "{{ secrets.AUTOMATE_RELAY_URL }}",
		);
		expect(workflow).toContain(
			"AUTOMATE_RELAY_URL must be configured for Desktop phone access.",
		);
	});
});
