import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopDir = import.meta.dir;
const repoDir = resolve(desktopDir, "../..");

function read(relativePath: string): string {
	return readFileSync(resolve(repoDir, relativePath), "utf8");
}

describe("desktop telemetry-free boundary", () => {
	test("does not depend on telemetry SDKs", () => {
		const packageJson = JSON.parse(read("apps/desktop/package.json")) as Record<
			string,
			Record<string, string> | undefined
		>;
		const dependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		for (const dependency of [
			"@sentry/electron",
			"@sentry/vite-plugin",
			"posthog-js",
			"posthog-node",
		]) {
			expect(dependencies).not.toHaveProperty(dependency);
		}
	});

	test("does not configure Desktop telemetry transports or credentials", () => {
		const guardedFiles = [
			"apps/desktop/electron.vite.config.ts",
			"apps/desktop/src/main/env.main.ts",
			"apps/desktop/src/preload/index.ts",
			"apps/desktop/src/renderer/env.renderer.ts",
			"apps/desktop/src/renderer/index.html",
			".github/workflows/build-desktop.yml",
			".env.example",
			".env.local.example",
		];
		const content = guardedFiles.map(read).join("\n");

		for (const forbidden of [
			"@sentry/",
			"posthog-js",
			"posthog-node",
			"NEXT_PUBLIC_POSTHOG",
			"SENTRY_DSN_DESKTOP",
			"SENTRY_AUTH_TOKEN",
			"sentry-ipc:",
			"*.posthog.com",
			"*.sentry.io",
		]) {
			expect(content).not.toContain(forbidden);
		}
	});
});
