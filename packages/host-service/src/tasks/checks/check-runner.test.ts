import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { runTaskCheck } from "./check-runner";

function check(
	command: string,
	timeoutMs = 2_000,
	signal = new AbortController().signal,
) {
	return runTaskCheck({
		check: { name: "check", command, timeoutMs },
		cwd: tmpdir(),
		signal,
		onStart: () => {},
	});
}
describe("real task check process boundary", () => {
	test("records stdout and actual exit status", async () => {
		const result = await check("printf real-output; exit 7");
		expect(result.exitCode).toBe(7);
		expect(result.status).toBe("failed");
		expect(result.output).toContain("real-output");
	});
	test("pipeline failures do not hide behind the final successful command", async () => {
		expect((await check("false | true")).status).toBe("failed");
	});
	test("checks are non-interactive and bounded", async () => {
		const result = await check("yes x | head -c 200000; exit 0");
		expect(result.output.length).toBeLessThanOrEqual(65536);
		expect(result.exitCode).toBe(0);
	});
	test("timeout cannot be marked successful", async () => {
		const result = await check("sleep 20", 100);
		expect(result.status).toBe("failed");
		expect(result.output).toContain("timed out");
	});
	test("pre-aborted check never spawns", async () => {
		const abort = new AbortController();
		abort.abort();
		const result = await check("echo should-not-run", 1000, abort.signal);
		expect(result.status).toBe("cancelled");
		expect(result.output).not.toContain("should-not-run");
	});
});
