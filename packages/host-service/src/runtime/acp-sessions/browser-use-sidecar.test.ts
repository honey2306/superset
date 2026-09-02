import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveBrowserUseSidecarPath } from "./browser-use-sidecar";

const expectedSuffix =
	"packages/host-service/src/runtime/acp-sessions/sidecar/agent-browser-sidecar.py";

describe("resolveBrowserUseSidecarPath", () => {
	test("falls back to checked-out source from the repository root", () => {
		const moduleUrl = pathToFileURL(
			path.join(
				process.cwd(),
				".tmp-missing-dist/main/chunks/browser-use-sidecar.js",
			),
		).href;
		const resolved = resolveBrowserUseSidecarPath(moduleUrl, process.cwd());

		expect(existsSync(resolved)).toBeTrue();
		expect(resolved).toEndWith(expectedSuffix);
	});

	test("resolves source when the detached daemon cwd is apps/desktop", () => {
		const repositoryRoot = process.cwd();
		const desktopCwd = path.join(repositoryRoot, "apps/desktop");
		const moduleUrl = pathToFileURL(
			path.join(desktopCwd, "dist/main/acp-daemon.js"),
		).href;
		const resolved = resolveBrowserUseSidecarPath(moduleUrl, desktopCwd);

		expect(existsSync(resolved)).toBeTrue();
		expect(resolved).toBe(path.join(repositoryRoot, expectedSuffix));
	});
});
