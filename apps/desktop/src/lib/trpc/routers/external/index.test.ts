import { expect, test } from "bun:test";
import path from "node:path";

test("external.openInApp with isolated Electron mocks", async () => {
	const fixturePath = path.join(import.meta.dir, "external.fixture.ts");
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
