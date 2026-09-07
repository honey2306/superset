import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
				type: "stdio",
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
				type: "stdio",
				name: "filesystem",
				command: "npx",
				args: ["-y", "server-filesystem", "/tmp"],
				env: { MODE: "read-only" },
				enabled: true,
			},
		]);

		upsertGlobalMcpServer(
			{
				type: "stdio",
				name: "filesystem",
				command: "bunx",
				args: ["server-filesystem", "/tmp"],
				env: {},
				enabled: false,
			},
			file,
		);
		expect(readGlobalMcpServers(file)[0]).toMatchObject({ command: "bunx" });
		upsertGlobalMcpServer(
			{
				type: "stdio",
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
					type: "stdio",
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

	it("persists native remote servers and preserves their ACP transport", () => {
		const file = configPath();
		upsertGlobalMcpServer(
			{
				type: "http",
				name: "docs",
				url: "https://mcp.example.com/api",
				headers: { Authorization: "Bearer test" },
				enabled: true,
			},
			file,
		);

		expect(readGlobalMcpServers(file)).toEqual([
			{
				type: "http",
				name: "docs",
				url: "https://mcp.example.com/api",
				headers: { Authorization: "Bearer test" },
				enabled: true,
			},
		]);
		expect(toAcpMcpServers(readGlobalMcpServers(file))).toEqual([
			{
				type: "http",
				name: "docs",
				url: "https://mcp.example.com/api",
				headers: [{ name: "Authorization", value: "Bearer test" }],
			},
		]);
	});

	it("normalizes the legacy npx mcp-remote shape to native HTTP", () => {
		const file = configPath();
		writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				servers: [
					{
						name: "remote",
						command: "npx",
						args: [
							"-y",
							"mcp-remote@0.8.3",
							"https://mcp.example.com/api",
							"--transport",
							"http-only",
							"--header",
							"X-User:example",
						],
						env: {},
						enabled: true,
					},
				],
			}),
		);

		expect(readGlobalMcpServers(file)).toEqual([
			{
				type: "http",
				name: "remote",
				url: "https://mcp.example.com/api",
				headers: { "X-User": "example" },
				enabled: true,
			},
		]);
	});

	it("only emits enabled servers in ACP format", () => {
		expect(
			toAcpMcpServers([
				{
					type: "stdio",
					name: "enabled",
					command: "node",
					args: ["server.js"],
					env: { TOKEN: "value" },
					enabled: true,
				},
				{
					type: "stdio",
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
					type: "stdio",
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
				type: "stdio",
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
