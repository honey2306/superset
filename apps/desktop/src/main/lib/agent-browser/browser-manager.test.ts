import { describe, expect, test } from "bun:test";
import path from "node:path";

const fixturePath = path.join(import.meta.dir, "browser-manager.fixture.ts");

describe("AgentBrowserManager page ownership", () => {
	test("closes agent pages while preserving user pages", async () => {
		const child = Bun.spawn([process.execPath, "test", fixturePath], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
	});
});
