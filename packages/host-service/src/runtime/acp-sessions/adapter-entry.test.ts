import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveBundledAcpEntry } from "./acp-sessions";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("resolveBundledAcpEntry", () => {
	test("finds a bridge beside the entry bundle when the caller lives in chunks", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "acp-entry-"));
		tempDirectories.push(root);
		const chunks = path.join(root, "chunks");
		mkdirSync(chunks);
		const bridge = path.join(root, "pi-acp.js");
		writeFileSync(bridge, "");

		expect(
			resolveBundledAcpEntry(
				["pi-acp.js", "pi-acp.mjs"],
				pathToFileURL(path.join(chunks, "daemon.js")).href,
			),
		).toBe(bridge);
	});

	test("prefers a bridge emitted beside the caller", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "acp-entry-"));
		tempDirectories.push(root);
		const bridge = path.join(root, "codex-app-server-acp.js");
		writeFileSync(bridge, "");

		expect(
			resolveBundledAcpEntry(
				["codex-app-server-acp.js"],
				pathToFileURL(path.join(root, "acp-daemon.js")).href,
			),
		).toBe(bridge);
	});
});
