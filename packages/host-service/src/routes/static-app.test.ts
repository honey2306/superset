import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { registerStaticAppRoute } from "./static-app";

const tempDirs: string[] = [];

function createDist(): string {
	const dir = mkdtempSync(join(tmpdir(), "host-static-app-"));
	tempDirs.push(dir);
	mkdirSync(join(dir, "assets"));
	writeFileSync(join(dir, "index.html"), "<html>phone app</html>");
	writeFileSync(join(dir, "assets", "app.js"), "console.log('phone')");
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("registerStaticAppRoute", () => {
	test("serves assets and falls back to the SPA shell for phone routes", async () => {
		const app = new Hono();
		registerStaticAppRoute({ app, distDir: createDist() });

		const [route, asset] = await Promise.all([
			app.request("http://host.test/app/pair?code=ABCD-EFGH"),
			app.request("http://host.test/app/assets/app.js"),
		]);

		expect(route.status).toBe(200);
		expect(await route.text()).toContain("phone app");
		expect(route.headers.get("cache-control")).toBe("no-cache");
		expect(asset.status).toBe(200);
		expect(await asset.text()).toContain("phone");
	});

	test("returns a useful error when the phone bundle was not built", async () => {
		const app = new Hono();
		registerStaticAppRoute({
			app,
			distDir: join(tmpdir(), "missing-superset-phone-bundle"),
		});

		const response = await app.request("http://host.test/app/pair");
		expect(response.status).toBe(503);
		expect(await response.text()).toContain("web bundle not built");
	});
});
