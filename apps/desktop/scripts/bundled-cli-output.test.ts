import { afterEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeBundledCliOutput } from "./bundled-cli-output";

describe("removeBundledCliOutput", () => {
	let tempDir = "";

	afterEach(() => {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it("removes a stale CLI artifact without deleting neighbouring resources", () => {
		tempDir = mkdtempSync(join(tmpdir(), "superset-cli-output-"));
		const binDir = join(tempDir, "dist", "resources", "bin");
		const migrationsDir = join(tempDir, "dist", "resources", "migrations");
		mkdirSync(binDir, { recursive: true });
		mkdirSync(migrationsDir, { recursive: true });
		writeFileSync(join(binDir, "superset"), "stale CLI");
		writeFileSync(join(migrationsDir, "migration.sql"), "select 1");

		removeBundledCliOutput(join(tempDir, "dist"));

		expect(existsSync(binDir)).toBeFalse();
		expect(existsSync(join(migrationsDir, "migration.sql"))).toBeTrue();
	});
});
