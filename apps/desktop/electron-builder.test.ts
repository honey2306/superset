import { describe, expect, it } from "bun:test";
import config from "./electron-builder";
import packageJson from "./package.json";

describe("electron-builder config", () => {
	it("keeps source maps and duplicate sounds out of app.asar", () => {
		expect(config.files).toContain("!dist/**/*.map");
		expect(config.files).toContain("!**/node_modules/**/*.map");
		expect(config.files).toContain("!dist/resources/sounds/**/*");
		expect(config.extraResources).toContainEqual({
			from: "dist/resources/sounds",
			to: "resources/sounds",
			filter: ["**/*"],
		});
	});

	it("excludes non-target Claude Agent SDK binaries", () => {
		expect(config.files).toContain(
			"!**/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/**/*",
		);
	});

	it("lets electron-builder remove all but English and Simplified Chinese locales", () => {
		expect(config.electronLanguages).toEqual(["en", "zh_CN"]);
		expect(config.electronLanguages).not.toContain("zh_TW");
	});

	it("publishes updater metadata to the configured repository with a mac ZIP", () => {
		expect(config.publish).toMatchObject({
			provider: "github",
			owner: "superset-sh",
			repo: "superset",
		});
		expect(config.mac?.target).toEqual(["dmg", "zip"]);
	});

	it("uses explicit runtime FileSets instead of automatic dependency collection", () => {
		expect(typeof config.beforeBuild).toBe("function");
		if (typeof config.beforeBuild === "function") {
			expect(config.beforeBuild({} as never)).toBeFalse();
		}
		expect(config.npmRebuild).toBeTrue();
		expect(config.afterPack).toBeUndefined();
	});

	it("keeps dock PNGs while pruning non-target native binaries", () => {
		expect(config.files).toContainEqual({
			from: "src/resources",
			to: "resources",
			filter: ["**/*", "!build/**/*", "build/icons/*.png", "!sounds/**/*"],
		});
		const nonTargetPlatform =
			process.platform === "linux" && process.arch === "x64"
				? { platform: "darwin", arch: "arm64" }
				: { platform: "linux", arch: "x64" };
		expect(config.files).toContain(
			`!**/node_modules/@duckdb/node-bindings-${nonTargetPlatform.platform}-${nonTargetPlatform.arch}/**/*`,
		);
		expect(config.files).toContain(
			`!**/node_modules/onnxruntime-node/bin/napi-v3/${nonTargetPlatform.platform}/${nonTargetPlatform.arch}/**/*`,
		);
	});
});

describe("desktop packaging scripts", () => {
	it("prepares every direct packaging variant", () => {
		expect(packageJson.scripts.package).toBe(
			"electron-builder --config electron-builder.ts",
		);
		expect(packageJson.scripts["package:canary"]).toStartWith(
			"bun run prepare:package && ",
		);
		expect(packageJson.scripts["package:personal"]).toStartWith(
			"bun run prepare:package && ",
		);
		expect(packageJson.scripts.release).toStartWith(
			"bun run prepare:package && ",
		);
	});

	it("rebuilds native modules before explicit runtime copies", () => {
		expect(packageJson.scripts["rebuild:native"]).toContain(
			"SUPERSET_REBUILD_NATIVE=1",
		);
		expect(packageJson.scripts["prepare:package"]).toContain(
			"bun run rebuild:native",
		);
		expect(packageJson.scripts.prebuild).toContain("bun run rebuild:native");
	});

	it("builds Canary through the full stable prebuild lifecycle", () => {
		expect(packageJson.scripts["build:canary"]).toContain("bun run build --");
	});
});
