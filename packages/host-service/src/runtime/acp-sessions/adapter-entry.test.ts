import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
	assertExternalClaudeCliAvailable,
	resolveAdapterProcess,
	resolveBundledAcpEntry,
} from "./acp-sessions";

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

	test("resolves the bundled Claude bridge beside the daemon entry", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "acp-entry-"));
		tempDirectories.push(root);
		const bridge = path.join(root, "claude-agent-acp.js");
		writeFileSync(bridge, "");

		expect(
			resolveBundledAcpEntry(
				["claude-agent-acp.js"],
				pathToFileURL(path.join(root, "acp-daemon.js")).href,
			),
		).toBe(bridge);
	});
});

test("starts mfcli ACP in its documented full-access approval mode", () => {
	expect(
		resolveAdapterProcess("myflicker-acp", {
			myflickerAdapterCommand: "/opt/tools/mfcli",
		}),
	).toEqual({
		command: "/opt/tools/mfcli",
		args: ["--approval-mode", "yolo", "acp"],
		usesElectronNode: false,
	});
});

test("explains how to install Claude when the external CLI is unavailable", () => {
	expect(() =>
		assertExternalClaudeCliAvailable({
			CLAUDE_CODE_EXECUTABLE: "/missing/superset-claude",
		}),
	).toThrow("Claude Code CLI is unavailable");
});

test("pins a PATH-resolved Claude command for the external-only bridge", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "external-claude-"));
	tempDirectories.push(root);
	const executable = path.join(root, "claude");
	writeFileSync(executable, "#!/bin/sh\nexit 0\n");
	chmodSync(executable, 0o755);
	const env: NodeJS.ProcessEnv = { ...process.env, PATH: root };
	delete env.CLAUDE_CODE_EXECUTABLE;
	assertExternalClaudeCliAvailable(env);
	expect(
		(env as Record<string, string | undefined>).CLAUDE_CODE_EXECUTABLE,
	).toBe("claude");
});
