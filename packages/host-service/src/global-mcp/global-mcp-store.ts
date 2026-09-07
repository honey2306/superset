import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { McpServer } from "@agentclientprotocol/sdk";
import { z } from "zod";

const GLOBAL_MCP_FILE_NAME = "global-mcp.json";
const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 2_000;
const STALE_LOCK_MS = 30_000;
const RESERVED_SERVER_NAMES = new Set([
	"browser-use",
	"desktop-control",
	"superset",
]);

export const globalMcpServerInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.regex(
				/^[A-Za-z0-9][A-Za-z0-9._-]*$/,
				"Use letters, numbers, dots, underscores, or hyphens.",
			),
		command: z
			.string()
			.trim()
			.min(1)
			.max(2_000)
			.refine((value) => !value.includes("\0"), "Command cannot contain NUL."),
		args: z
			.array(
				z
					.string()
					.max(10_000)
					.refine(
						(value) => !value.includes("\0"),
						"Arguments cannot contain NUL.",
					),
			)
			.max(100)
			.default([]),
		env: z
			.record(
				z
					.string()
					.regex(
						/^[A-Za-z_][A-Za-z0-9_]*$/,
						"Environment variable names must be shell-compatible.",
					),
				z
					.string()
					.max(100_000)
					.refine(
						(value) => !value.includes("\0"),
						"Environment values cannot contain NUL.",
					),
			)
			.default({}),
		enabled: z.boolean().default(true),
	})
	.strict()
	.superRefine((server, context) => {
		if (RESERVED_SERVER_NAMES.has(server.name)) {
			context.addIssue({
				code: "custom",
				path: ["name"],
				message: `'${server.name}' is reserved by Superset.`,
			});
		}
	});

export type GlobalMcpServer = z.infer<typeof globalMcpServerInputSchema>;

const globalMcpFileSchema = z
	.object({
		version: z.literal(1),
		servers: z.array(globalMcpServerInputSchema).max(100),
	})
	.strict()
	.superRefine((value, context) => {
		const names = new Set<string>();
		for (const [index, server] of value.servers.entries()) {
			if (names.has(server.name)) {
				context.addIssue({
					code: "custom",
					path: ["servers", index, "name"],
					message: "MCP server names must be unique.",
				});
			}
			names.add(server.name);
		}
	});

export function globalMcpConfigPath(
	environment: NodeJS.ProcessEnv = process.env,
): string {
	const home =
		environment.SUPERSET_HOME_DIR?.trim() || path.join(homedir(), ".superset");
	return path.join(home, GLOBAL_MCP_FILE_NAME);
}

export function readGlobalMcpServers(
	configPath = globalMcpConfigPath(),
): GlobalMcpServer[] {
	if (!existsSync(configPath)) return [];
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (error) {
		throw new Error(
			`Could not read global MCP settings at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const parsed = globalMcpFileSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(
			`Invalid global MCP settings at ${configPath}: ${parsed.error.issues[0]?.message ?? "invalid configuration"}`,
		);
	}
	return parsed.data.servers;
}

function writeGlobalMcpServers(
	servers: readonly GlobalMcpServer[],
	configPath = globalMcpConfigPath(),
): void {
	const value = globalMcpFileSchema.parse({ version: 1, servers });
	const directory = path.dirname(configPath);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		renameSync(temporaryPath, configPath);
		chmodSync(configPath, 0o600);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}

function wait(milliseconds: number): void {
	const shared = new SharedArrayBuffer(4);
	Atomics.wait(new Int32Array(shared), 0, 0, milliseconds);
}

function withGlobalMcpLock<T>(configPath: string, mutate: () => T): T {
	const lockPath = `${configPath}.lock`;
	mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	for (;;) {
		try {
			mkdirSync(lockPath, { mode: 0o700 });
			break;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw error;
			try {
				if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
					rmSync(lockPath, { force: true, recursive: true });
					continue;
				}
			} catch {
				continue;
			}
			if (Date.now() >= deadline) {
				throw new Error("Timed out waiting to update global MCP settings.");
			}
			wait(LOCK_RETRY_MS);
		}
	}
	try {
		return mutate();
	} finally {
		rmSync(lockPath, { force: true, recursive: true });
	}
}

export function upsertGlobalMcpServer(
	input: GlobalMcpServer,
	configPath = globalMcpConfigPath(),
): GlobalMcpServer {
	const server = globalMcpServerInputSchema.parse(input);
	return withGlobalMcpLock(configPath, () => {
		const servers = readGlobalMcpServers(configPath);
		const existingIndex = servers.findIndex(
			(entry) => entry.name === server.name,
		);
		if (existingIndex < 0) servers.push(server);
		else servers[existingIndex] = server;
		writeGlobalMcpServers(servers, configPath);
		return server;
	});
}

export function replaceGlobalMcpServer(
	originalName: string,
	input: GlobalMcpServer,
	configPath = globalMcpConfigPath(),
): GlobalMcpServer {
	const server = globalMcpServerInputSchema.parse(input);
	return withGlobalMcpLock(configPath, () => {
		const servers = readGlobalMcpServers(configPath);
		const originalIndex = servers.findIndex(
			(entry) => entry.name === originalName,
		);
		if (originalIndex < 0) {
			throw new Error(`Global MCP server '${originalName}' was not found.`);
		}
		const conflictingIndex = servers.findIndex(
			(entry) => entry.name === server.name,
		);
		if (conflictingIndex >= 0 && conflictingIndex !== originalIndex) {
			throw new Error(`Global MCP server '${server.name}' already exists.`);
		}
		servers[originalIndex] = server;
		writeGlobalMcpServers(servers, configPath);
		return server;
	});
}

export function removeGlobalMcpServer(
	name: string,
	configPath = globalMcpConfigPath(),
): boolean {
	return withGlobalMcpLock(configPath, () => {
		const servers = readGlobalMcpServers(configPath);
		const next = servers.filter((server) => server.name !== name);
		if (next.length === servers.length) return false;
		writeGlobalMcpServers(next, configPath);
		return true;
	});
}

export function toAcpMcpServers(
	servers: readonly GlobalMcpServer[],
): McpServer[] {
	return servers
		.filter((server) => server.enabled)
		.map((server) => ({
			name: server.name,
			command: server.command,
			args: server.args,
			env: Object.entries(server.env).map(([name, value]) => ({ name, value })),
		}));
}
