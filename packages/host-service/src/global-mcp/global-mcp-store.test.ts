import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	readGlobalMcpServers,
	removeGlobalMcpServer,
	replaceGlobalMcpServer,
	toAcpMcpServers,
	upsertGlobalMcpServer,
} from "./global-mcp-store";

const directories: string[] = [];

function configPath(): string {
	const directory = mkdtempSync(path.join(tmpdir(), "superset-global-mcp-"));
	directories.push(directory);
	return path.join(directory, "global-mcp.json");
}

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("global MCP store", () => {
	it("persists, updates, and removes a stdio server", () => {
		const file = configPath();
		upsertGlobalMcpServer(
			{
				name: "filesystem",
				command: "npx",
				args: ["-y", "server-filesystem", "/tmp"],
				env: { MODE: "read-only" },
				enabled: true,
			},
			file,
		);
		expect(readGlobalMcpServers(file)).toEqual([
			{
				name: "filesystem",
				command: "npx",
				args: ["-y", "server-filesystem", "/tmp"],
				env: { MODE: "read-only" },
				enabled: true,
			},
		]);

		upsertGlobalMcpServer(
			{
				name: "filesystem",
				command: "bunx",
				args: ["server-filesystem", "/tmp"],
				env: {},
				enabled: false,
			},
			file,
		);
		expect(readGlobalMcpServers(file)[0]?.command).toBe("bunx");
		upsertGlobalMcpServer(
			{
				name: "other",
				command: "node",
				args: [],
				env: {},
				enabled: true,
			},
			file,
		);
		expect(() =>
			replaceGlobalMcpServer(
				"filesystem",
				{
					name: "other",
					command: "bun",
					args: [],
					env: {},
					enabled: true,
				},
				file,
			),
		).toThrow("already exists");
		expect(readGlobalMcpServers(file).map((server) => server.name)).toEqual([
			"filesystem",
			"other",
		]);
		expect(removeGlobalMcpServer("filesystem", file)).toBe(true);
		expect(readGlobalMcpServers(file).map((server) => server.name)).toEqual([
			"other",
		]);
	});

	it("only emits enabled servers in ACP format", () => {
		expect(
			toAcpMcpServers([
				{
					name: "enabled",
					command: "node",
					args: ["server.js"],
					env: { TOKEN: "value" },
					enabled: true,
				},
				{
					name: "disabled",
					command: "node",
					args: [],
					env: {},
					enabled: false,
				},
			]),
		).toEqual([
			{
				name: "enabled",
				command: "node",
				args: ["server.js"],
				env: [{ name: "TOKEN", value: "value" }],
			},
		]);
	});

	it("rejects reserved names and keeps the file private", () => {
		const file = configPath();
		expect(() =>
			upsertGlobalMcpServer(
				{
					name: "superset",
					command: "node",
					args: [],
					env: {},
					enabled: true,
				},
				file,
			),
		).toThrow("reserved");

		upsertGlobalMcpServer(
			{
				name: "valid",
				command: "node",
				args: [],
				env: {},
				enabled: true,
			},
			file,
		);
		expect(JSON.parse(readFileSync(file, "utf8")).version).toBe(1);
	});
});
