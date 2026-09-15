import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	memoryAccessSettingsConfigPath,
	readMemoryAccessSettings,
	writeMemoryAccessSettings,
} from "./memory-access-settings";

const directories: string[] = [];

function configPath(): string {
	const directory = mkdtempSync(path.join(tmpdir(), "superset-memory-access-"));
	directories.push(directory);
	return path.join(directory, "settings.json");
}

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("memory access settings", () => {
	it("defaults to off and persists settings atomically", () => {
		const file = configPath();
		expect(readMemoryAccessSettings("org-a", file)).toEqual({
			mode: "off",
			projectIds: [],
		});

		expect(
			writeMemoryAccessSettings(
				"org-a",
				{
					mode: "selected",
					projectIds: ["2a1b9f50-80e9-4633-aefd-bc7065e60980"],
				},
				file,
			),
		).toEqual({
			mode: "selected",
			projectIds: ["2a1b9f50-80e9-4633-aefd-bc7065e60980"],
		});
		expect(readMemoryAccessSettings("org-a", file)).toEqual({
			mode: "selected",
			projectIds: ["2a1b9f50-80e9-4633-aefd-bc7065e60980"],
		});
		expect(readFileSync(file, "utf8")).toContain('"mode": "selected"');
	});

	it("fails closed for malformed settings", () => {
		const file = configPath();
		writeFileSync(file, "{ invalid", "utf8");
		expect(() => readMemoryAccessSettings("org-a", file)).toThrow(
			"Could not read memory access settings",
		);
	});

	it("separates organization config files", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "superset-memory-home-"));
		directories.push(directory);
		expect(
			memoryAccessSettingsConfigPath("org/a", { SUPERSET_HOME_DIR: directory }),
		).toBe(path.join(directory, "memory-access", "org%2Fa.json"));
	});
});
