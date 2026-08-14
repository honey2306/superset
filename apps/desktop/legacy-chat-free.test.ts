import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoDir = resolve(import.meta.dir, "../..");

function read(relativePath: string): string {
	return readFileSync(resolve(repoDir, relativePath), "utf8");
}

describe("legacy chat removal boundary", () => {
	test("does not expose the legacy chat runtime, router, agent, or renderer", () => {
		for (const removedPath of [
			"packages/host-service/src/runtime/chat",
			"packages/host-service/src/trpc/router/chat",
			"apps/desktop/src/renderer/components/Chat",
		]) {
			expect(existsSync(resolve(repoDir, removedPath))).toBe(false);
		}

		const sources = [
			"packages/shared/src/agent-catalog.ts",
			"packages/shared/src/agent-launch.ts",
			"packages/host-service/src/trpc/router/router.ts",
			"packages/host-service/src/types.ts",
		].map(read);
		expect(sources.join("\n")).not.toMatch(
			/ChatRuntime|chatRouter|kind:\s*["']chat["']|["']superset["']\s*,/,
		);
	});

	test("keeps Phone Access and relay routes wired", () => {
		const app = read("packages/host-service/src/app.ts");
		const router = read("packages/host-service/src/trpc/router/router.ts");
		expect(app).toContain("PhoneAuthService");
		expect(app).toContain("relayMailboxId");
		expect(router).toContain("phone: phoneRouter");
		expect(
			existsSync(
				resolve(
					repoDir,
					"apps/desktop/src/renderer/routes/_local/settings/phone",
				),
			),
		).toBe(true);
	});
});
