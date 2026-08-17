import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@agentclientprotocol/sdk";
import {
	materializePiMcpConfig,
	piMcpConfig,
	resolvePiAcpMcpExtensionPath,
} from "./pi-acp-mcp-config";

const browserUse: McpServer = {
	name: "browser-use",
	command: "/opt/browser-use",
	args: ["--cli-mcp"],
	env: [{ name: "BROWSER_TOKEN", value: "secret" }],
};

test("converts ACP stdio servers to isolated direct Pi MCP tools", () => {
	expect(piMcpConfig([browserUse])).toEqual({
		mcpServers: {
			"browser-use": {
				command: "/opt/browser-use",
				args: ["--cli-mcp"],
				env: { BROWSER_TOKEN: "secret" },
			},
		},
	});
});

test("rejects duplicate server names and unsupported ACP transport", () => {
	expect(() => piMcpConfig([browserUse, browserUse])).toThrow(
		"Duplicate ACP MCP server name",
	);
	expect(() =>
		piMcpConfig([
			{
				type: "acp",
				name: "client-owned",
				serverId: "server-1",
			},
		]),
	).toThrow("Unsupported ACP MCP transport");
});

test("materializes an owner-only config and removes it idempotently", () => {
	const materialized = materializePiMcpConfig([browserUse]);
	const directory = materialized.path.replace(/\/mcp\.json$/, "");
	try {
		expect(statSync(directory).mode & 0o777).toBe(0o700);
		expect(statSync(materialized.path).mode & 0o777).toBe(0o600);
	} finally {
		materialized.dispose();
		materialized.dispose();
	}
	expect(existsSync(directory)).toBe(false);
});

test("prefers the materialized packaged extension path", () => {
	const directory = mkdtempSync(
		path.join(os.tmpdir(), "pi-acp-extension-test-"),
	);
	const resources = path.join(directory, "Resources");
	const extension = path.join(
		resources,
		"pi-extensions",
		"pi-acp-mcp-extension.js",
	);
	mkdirSync(path.dirname(extension), { recursive: true });
	writeFileSync(extension, "export default () => {};");
	try {
		expect(
			resolvePiAcpMcpExtensionPath(
				"file:///source/acp/pi-acp-mcp-config.js",
				resources,
			),
		).toBe(extension);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
});
