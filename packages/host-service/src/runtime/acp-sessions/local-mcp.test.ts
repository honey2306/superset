import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	BROWSER_USE_MCP_ENV,
	browserUseMcpServerFromEnvironment,
	embeddedBrowserUseMcpServer,
} from "./local-mcp";

test("Browser Use MCP can be explicitly disabled", () => {
	expect(
		browserUseMcpServerFromEnvironment({
			[BROWSER_USE_MCP_ENV]: "0",
			PATH: "/definitely/not/a/path",
		}),
	).toBeNull();
});

test("Browser Use MCP auto-enables an installed browser-use executable", () => {
	const executable = process.execPath;
	const binDir = mkdtempSync(path.join(os.tmpdir(), "browser-use-mcp-"));
	symlinkSync(executable, path.join(binDir, "browser-use"));
	const environment = {
		PATH: binDir,
	};
	try {
		expect(browserUseMcpServerFromEnvironment(environment)).toEqual({
			name: "browser-use",
			command: path.join(binDir, "browser-use"),
			args: ["--cli-mcp"],
			env: [],
		});
	} finally {
		rmSync(binDir, { recursive: true, force: true });
	}
});

test("passes session-specific CDP settings to the official MCP", () => {
	const executable = process.execPath;
	const binDir = mkdtempSync(path.join(os.tmpdir(), "browser-use-mcp-"));
	symlinkSync(executable, path.join(binDir, "browser-use"));
	try {
		expect(
			browserUseMcpServerFromEnvironment(
				{ PATH: binDir },
				{
					BU_CDP_URL: "http://127.0.0.1:9876/token/session-1",
					BU_NAME: "superset-session-1",
				},
			),
		).toMatchObject({
			command: path.join(binDir, "browser-use"),
			args: ["--cli-mcp"],
			env: [
				{
					name: "BU_CDP_URL",
					value: "http://127.0.0.1:9876/token/session-1",
				},
				{ name: "BU_NAME", value: "superset-session-1" },
			],
		});
	} finally {
		rmSync(binDir, { recursive: true, force: true });
	}
});

test("builds a session-scoped official MCP endpoint", () => {
	const executable = process.execPath;
	const binDir = mkdtempSync(path.join(os.tmpdir(), "browser-use-mcp-"));
	symlinkSync(executable, path.join(binDir, "browser-use"));
	try {
		expect(
			embeddedBrowserUseMcpServer({
				sessionId: "session/one",
				cdpProxyUrl: "http://127.0.0.1:9876/token",
				environment: { PATH: binDir },
			}),
		).toMatchObject({
			name: "browser-use",
			command: path.join(binDir, "browser-use"),
			args: ["--cli-mcp"],
			env: [
				{
					name: "BU_CDP_URL",
					value: "http://127.0.0.1:9876/token/session%2Fone",
				},
				{ name: "BU_NAME", value: "superset-session/one" },
				{ name: "BH_CLIENT", value: "superset-agent-browser" },
			],
		});
	} finally {
		rmSync(binDir, { recursive: true, force: true });
	}
});

test("Browser Use MCP falls back to uvx with the Browser Use 3 CLI flag", () => {
	const executable = process.execPath;
	const binDir = mkdtempSync(path.join(os.tmpdir(), "browser-use-mcp-"));
	symlinkSync(executable, path.join(binDir, "uvx"));
	try {
		expect(
			browserUseMcpServerFromEnvironment({
				[BROWSER_USE_MCP_ENV]: "1",
				PATH: binDir,
			}),
		).toEqual({
			name: "browser-use",
			command: path.join(binDir, "uvx"),
			args: ["browser-use@latest", "--cli-mcp"],
			env: [],
		});
	} finally {
		rmSync(binDir, { recursive: true, force: true });
	}
});
