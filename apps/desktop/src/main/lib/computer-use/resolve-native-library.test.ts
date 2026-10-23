import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLibPath } from "./resolve-native-library";

const fixtures: string[] = [];

afterEach(() => {
	for (const fixture of fixtures.splice(0)) {
		rmSync(fixture, { recursive: true, force: true });
	}
});

test("loads an unpacked native library when UniFFI resolves it inside app.asar", () => {
	const fixture = mkdtempSync(join(tmpdir(), "superset-cua-asar-"));
	fixtures.push(fixture);
	const library = "libcua_driver_sdk.dylib";
	const archivedDir = join(fixture, "app.asar", "node_modules", "@trycua");
	const unpackedDir = join(
		fixture,
		"app.asar.unpacked",
		"node_modules",
		"@trycua",
	);
	mkdirSync(archivedDir, { recursive: true });
	mkdirSync(unpackedDir, { recursive: true });
	const archivedPath = join(archivedDir, library);
	const unpackedPath = join(unpackedDir, library);
	writeFileSync(archivedPath, "archive placeholder");
	writeFileSync(unpackedPath, "native library placeholder");

	expect(
		resolveLibPath({
			crateName: "cua_driver_sdk",
			callerUrl: import.meta.url,
			override: archivedPath,
		}),
	).toBe(unpackedPath);
});

test("keeps the original path when no unpacked library exists", () => {
	const fixture = mkdtempSync(join(tmpdir(), "superset-cua-asar-"));
	fixtures.push(fixture);
	const archivedDir = join(fixture, "app.asar", "node_modules", "@trycua");
	mkdirSync(archivedDir, { recursive: true });
	const archivedPath = join(archivedDir, "libcua_driver_sdk.dylib");
	writeFileSync(archivedPath, "native library placeholder");

	expect(
		resolveLibPath({
			crateName: "cua_driver_sdk",
			callerUrl: import.meta.url,
			override: archivedPath,
		}),
	).toBe(archivedPath);
});
