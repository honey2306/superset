import { Database as BunDatabase } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
	emptyTimeline,
	foldEnvelopes,
	type Timeline,
} from "@superset/session-protocol";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../src/db/schema";
import {
	ACP_DAEMON_BUILD_VERSION,
	AcpDaemonClient,
} from "../../src/runtime/acp-sessions/daemon";

const desktopRequire = createRequire(
	path.resolve(import.meta.dir, "../../../../apps/desktop/package.json"),
);
const ELECTRON_NODE = desktopRequire("electron") as string;
const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");
const DAEMON_ENTRY = path.resolve(
	import.meta.dir,
	"../../src/runtime/acp-sessions/daemon-entry.ts",
);
const FAKE_ADAPTER = path.resolve(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	label: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() > deadline)
			throw new Error(`timed out waiting for ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

async function rawRequest(
	socketPath: string,
	message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		let buffer = "";
		socket.setEncoding("utf8");
		socket.once("error", reject);
		socket.once("connect", () => socket.write(`${JSON.stringify(message)}\n`));
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			const newline = buffer.indexOf("\n");
			if (newline < 0) return;
			socket.destroy();
			resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>);
		});
	});
}

function agentText(timeline: Timeline): string {
	return timeline.items
		.filter((item) => item.kind === "message" && item.role === "agent")
		.flatMap((item) => (item.kind === "message" ? item.blocks : []))
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("\n");
}

async function buildEntry(
	entrypoint: string,
	outdir: string,
	name: string,
	external: string[] = [],
): Promise<string> {
	const result = await Bun.build({
		entrypoints: [entrypoint],
		target: "node",
		outdir,
		naming: `${name}.js`,
		format: "esm",
		external,
	});
	if (!result.success) {
		throw new Error(result.logs.map((log) => log.message).join("\n"));
	}
	return path.join(outdir, `${name}.js`);
}

describe("ACP daemon process boundary", () => {
	const tempRoot = mkdtempSync(path.join(os.tmpdir(), "acp-daemon-e2e-"));
	const buildDir = path.resolve(
		import.meta.dir,
		`../../.cache/acp-daemon-e2e-${process.pid}`,
	);
	const workspaceDir = path.join(tempRoot, "workspace");
	const dbPath = path.join(tempRoot, "host.db");
	const socketPath = path.join(tempRoot, "acp.sock");
	let daemonPid: number | null = null;

	afterAll(() => {
		if (daemonPid) {
			try {
				process.kill(daemonPid, "SIGKILL");
			} catch {}
		}
		rmSync(tempRoot, { recursive: true, force: true });
		rmSync(buildDir, { recursive: true, force: true });
	});

	test("permission and AskUser remain actionable after the host client reconnects", async () => {
		mkdirSync(buildDir, { recursive: true });
		mkdirSync(workspaceDir, { recursive: true });
		const daemonScript = await buildEntry(
			DAEMON_ENTRY,
			buildDir,
			"acp-daemon",
			["better-sqlite3"],
		);
		const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
		sqlite.exec("PRAGMA foreign_keys = ON");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		const now = Date.now();
		sqlite
			.query(
				"INSERT INTO projects (id, repo_path, name, kind, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run("project-1", workspaceDir, "Project", "repository", now, now);
		sqlite
			.query(
				"INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				"workspace-1",
				"project-1",
				workspaceDir,
				"main",
				"Workspace",
				"main",
				now,
				now,
			);
		sqlite.close();

		const clientOptions = {
			organizationId: "org-daemon-e2e",
			scriptPath: daemonScript,
			socketPath,
			execPath: ELECTRON_NODE,
			expectedBuildVersion: ACP_DAEMON_BUILD_VERSION,
			spawnEnv: {
				ORGANIZATION_ID: "org-daemon-e2e",
				HOST_DB_PATH: dbPath,
				HOST_MIGRATIONS_FOLDER: MIGRATIONS_FOLDER,
				SUPERSET_HOME_DIR: tempRoot,
				SUPERSET_ACP_ADAPTER_ENTRY: FAKE_ADAPTER,
				NODE_OPTIONS:
					`${process.env.NODE_OPTIONS ?? ""} --experimental-strip-types`.trim(),
			},
		} as const;

		const first = new AcpDaemonClient(clientOptions);
		await first.create({
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});
		const hello = await first.hello();
		daemonPid = hello.pid;
		expect(hello.protocolVersion).toBe(1);
		expect(hello.buildVersion).toBe(ACP_DAEMON_BUILD_VERSION);

		await first.prompt({
			sessionId: "session-1",
			prompt: [{ type: "text", text: "permission risky-write" }],
		});
		await waitFor(
			async () =>
				(await first.get("session-1")).pendingPermissions.length === 1,
			"permission request",
		);
		const permission = (await first.get("session-1")).pendingPermissions[0];
		if (!permission) throw new Error("permission disappeared");
		await expect(first.shutdown()).rejects.toThrow("pending interaction");
		await first.dispose();

		const second = new AcpDaemonClient({
			...clientOptions,
			spawnIfMissing: false,
		});
		expect((await second.hello()).pid).toBe(daemonPid);
		expect(
			(await second.get("session-1")).pendingPermissions[0]?.requestId,
		).toBe(permission.requestId);
		expect(
			await second.respondToPermission({
				sessionId: "session-1",
				requestId: permission.requestId,
				outcome: { outcome: "selected", optionId: "allow" },
			}),
		).toEqual({ status: "resolved" });
		await waitFor(
			async () =>
				(await second.get("session-1")).pendingPermissions.length === 0,
			"permission completion",
		);

		await second.prompt({
			sessionId: "session-1",
			prompt: [{ type: "text", text: "ask-single Choose one|Alpha,Beta" }],
		});
		await waitFor(
			async () =>
				(await second.get("session-1")).pendingPermissions.length === 1,
			"AskUser request",
		);
		const question = (await second.get("session-1")).pendingPermissions[0];
		if (!question) throw new Error("AskUser request disappeared");
		await second.dispose();

		const third = new AcpDaemonClient({
			...clientOptions,
			spawnIfMissing: false,
		});
		expect((await third.hello()).pid).toBe(daemonPid);
		expect(
			(await third.get("session-1")).pendingPermissions[0]?.requestId,
		).toBe(question.requestId);
		await third.respondToPermission({
			sessionId: "session-1",
			requestId: question.requestId,
			outcome: { outcome: "selected", optionId: "option-1" },
		});
		await waitFor(
			async () =>
				(await third.get("session-1")).pendingPermissions.length === 0,
			"AskUser completion",
		);
		await waitFor(async () => {
			const page = await third.getMessages({
				sessionId: "session-1",
				limit: 500,
			});
			return agentText(foldEnvelopes(emptyTimeline(), page.items)).includes(
				"picked:Beta",
			);
		}, "AskUser turn completion");

		const unsupported = await rawRequest(socketPath, {
			type: "request",
			id: "unsupported-op",
			op: "not-real",
			params: {},
		});
		expect(unsupported).toMatchObject({
			type: "response",
			id: "unsupported-op",
			ok: false,
		});

		await third.shutdown({ force: true });
		await third.dispose();
		await waitFor(() => {
			if (!daemonPid) return true;
			try {
				process.kill(daemonPid, 0);
				return false;
			} catch {
				return true;
			}
		}, "daemon shutdown");
		daemonPid = null;
	}, 60_000);
});
