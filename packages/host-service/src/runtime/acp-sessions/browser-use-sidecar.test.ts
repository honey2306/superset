import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
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

	test("resolves an unpacked sidecar outside app.asar", () => {
		const tempRoot = path.join(os.tmpdir(), `superset-sidecar-${process.pid}`);
		const scriptPath = path.join(
			tempRoot,
			"app.asar.unpacked/dist/main/sidecar/agent-browser-sidecar.py",
		);
		mkdirSync(path.dirname(scriptPath), { recursive: true });
		writeFileSync(scriptPath, "");
		try {
			const moduleUrl = pathToFileURL(
				path.join(tempRoot, "app.asar/dist/main/acp-daemon.js"),
			).href;
			const resolved = resolveBrowserUseSidecarPath(
				moduleUrl,
				path.join(tempRoot, "missing-cwd"),
			);

			expect(resolved).toBe(scriptPath);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	test("resolves source when the detached daemon cwd is apps/desktop", () => {
		const repositoryRoot = path.resolve(process.cwd(), "../..");
		const desktopCwd = path.join(repositoryRoot, "apps/desktop");
		const moduleUrl = pathToFileURL(
			path.join(desktopCwd, ".tmp-missing-dist/main/acp-daemon.js"),
		).href;
		const resolved = resolveBrowserUseSidecarPath(moduleUrl, desktopCwd);

		expect(existsSync(resolved)).toBeTrue();
		expect(resolved).toBe(path.join(repositoryRoot, expectedSuffix));
	});
});
