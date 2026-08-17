import { Database as BunDatabase } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
	decodeMessagesCursor,
	emptyTimeline,
	foldEnvelopes,
	type Timeline,
} from "@superset/session-protocol";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../src/db/schema";
import {
	ACP_DAEMON_BUILD_VERSION,
	ACP_DAEMON_PROTOCOL_VERSION,
	AcpDaemonClient,
} from "../../src/runtime/acp-sessions/daemon";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");
const DAEMON_ENTRY = path.resolve(
	import.meta.dir,
	"../../src/runtime/acp-sessions/daemon-entry.ts",
);
const PI_ACP_MCP_EXTENSION = path.resolve(
	import.meta.dir,
	"../../src/runtime/acp-sessions/pi-acp-mcp-extension.ts",
);
const FAKE_ADAPTER = path.resolve(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const BUN_DB_SHIM = path.resolve(import.meta.dir, "../fixtures/bun-host-db.ts");

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
			for (;;) {
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				const response = JSON.parse(line) as Record<string, unknown>;
				if (response.type !== "response" || response.id !== message.id)
					continue;
				socket.destroy();
				resolve(response);
				return;
			}
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

async function buildDaemonEntry(
	entrypoint: string,
	outdir: string,
	name: string,
): Promise<string> {
	const result = await Bun.build({
		entrypoints: [entrypoint],
		target: "node",
		outdir,
		naming: `${name}.js`,
		format: "esm",
		plugins: [
			{
				name: "bun-host-db",
				setup(build) {
					build.onResolve({ filter: /^\.\.\/\.\.\/db$/ }, () => ({
						path: BUN_DB_SHIM,
					}));
				},
			},
		],
	});
	if (!result.success) {
		throw new Error(result.logs.map((log) => log.message).join("\n"));
	}
	const extension = await Bun.build({
		entrypoints: [PI_ACP_MCP_EXTENSION],
		target: "node",
		outdir,
		naming: "pi-acp-mcp-extension.js",
		format: "esm",
	});
	if (!extension.success) {
		throw new Error(extension.logs.map((log) => log.message).join("\n"));
	}
	return path.join(outdir, `${name}.js`);
}

async function createDaemonSession(
	client: AcpDaemonClient,
	input: { sessionId: string; workspaceId: string },
	logPath: string,
): Promise<void> {
	try {
		await client.create(input);
	} catch (error) {
		const log = existsSync(logPath)
			? readFileSync(logPath, "utf8").slice(-12_000)
			: "<daemon log was not created>";
		throw new Error(
			`${error instanceof Error ? error.message : String(error)}\nDaemon log (${logPath}):\n${log}`,
		);
	}
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
	const daemonLogPath = path.join(tempRoot, "acp-daemon.log");
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
		const daemonScript = await buildDaemonEntry(
			DAEMON_ENTRY,
			buildDir,
			"acp-daemon",
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
			execPath: process.execPath,
			expectedBuildVersion: ACP_DAEMON_BUILD_VERSION,
			spawnEnv: {
				ORGANIZATION_ID: "org-daemon-e2e",
				HOST_DB_PATH: dbPath,
				HOST_MIGRATIONS_FOLDER: MIGRATIONS_FOLDER,
				SUPERSET_HOME_DIR: tempRoot,
				SUPERSET_ACP_DAEMON_LOG_PATH: daemonLogPath,
				SUPERSET_ACP_ADAPTER_ENTRY: FAKE_ADAPTER,
				NODE_OPTIONS:
					`${process.env.NODE_OPTIONS ?? ""} --experimental-strip-types`.trim(),
			},
		} as const;

		const first = new AcpDaemonClient(clientOptions);
		await createDaemonSession(
			first,
			{ sessionId: "session-1", workspaceId: "workspace-1" },
			daemonLogPath,
		);
		const hello = await first.hello();
		daemonPid = hello.pid;
		expect(hello.protocolVersion).toBe(ACP_DAEMON_PROTOCOL_VERSION);
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
		let imageArtifactPath: string | undefined;
		await waitFor(async () => {
			const page = await third.getMessages({
				sessionId: "session-1",
				limit: 500,
			});
			return agentText(foldEnvelopes(emptyTimeline(), page.items)).includes(
				"picked:Beta",
			);
		}, "AskUser turn completion");

		// Five 4 MiB frames reproduce a >16 MiB history response. The daemon
		// must page it below the NDJSON limit, then replay every sequence over a
		// socket which applies backpressure after the first large write.
		await createDaemonSession(
			third,
			{ sessionId: "session-large", workspaceId: "workspace-1" },
			daemonLogPath,
		);
		await third.prompt({
			sessionId: "session-large",
			prompt: [{ type: "text", text: "large 5 4194304" }],
		});
		await waitFor(async () => {
			const page = await third.getMessages({
				sessionId: "session-large",
				limit: 200,
			});
			return (
				page.items.filter((item) => item.frame.kind === "update").length === 1
			);
		}, "large journal frames");
		const pagedSeqs: number[] = [];
		let cursor: string | null | undefined;
		do {
			const page = await third.getMessages({
				sessionId: "session-large",
				limit: 200,
				...(cursor
					? { beforeSeq: decodeMessagesCursor(cursor) ?? undefined }
					: {}),
			});
			pagedSeqs.unshift(...page.items.map((item) => item.seq));
			cursor = page.nextCursor;
		} while (cursor);
		expect(pagedSeqs).toEqual(
			[...pagedSeqs].sort((left, right) => left - right),
		);
		expect(pagedSeqs).toHaveLength(7); // startup + user prompt + five tools

		const replayedSeqs: number[] = [];
		const stopLargeReplay = await third.subscribe({
			sessionId: "session-large",
			since: 0,
			onEnvelope: (envelope) => replayedSeqs.push(envelope.seq),
		});
		const latestLargeSeq = (await third.get("session-large")).lastSeq;
		await waitFor(
			() => replayedSeqs.at(-1) === latestLargeSeq,
			"backpressured large replay",
		);
		expect(replayedSeqs).toEqual(
			Array.from({ length: latestLargeSeq }, (_, index) => index + 1),
		);
		stopLargeReplay();
		expect((await third.hello()).pid).toBe(daemonPid);

		await third.prompt({
			sessionId: "session-large",
			prompt: [{ type: "text", text: "large-image 4194304" }],
		});
		await waitFor(async () => {
			const page = await third.getMessages({
				sessionId: "session-large",
				limit: 200,
			});
			return page.items.some((item) => {
				if (item.frame.kind !== "update" || !("rawOutput" in item.frame.update))
					return false;
				const rawOutput = item.frame.update.rawOutput as {
					content?: Array<{ locator?: { path?: string } }>;
				};
				imageArtifactPath = rawOutput.content?.[0]?.locator?.path;
				return imageArtifactPath !== undefined;
			});
		}, "bounded inline image output");
		if (!imageArtifactPath)
			throw new Error("inline image artifact was missing");
		expect(existsSync(imageArtifactPath)).toBe(true);
		await third.close({ sessionId: "session-large" });
		expect(existsSync(imageArtifactPath)).toBe(false);
		expect((await third.hello()).pid).toBe(daemonPid);

		const openRequests: Array<{ sessionId: string; sourceSessionId: string }> =
			[];
		const stopOpenRequests = third.onSessionOpenRequested((event) => {
			openRequests.push(event);
		});
		const continuation = await rawRequest(socketPath, {
			type: "request",
			id: "continue-session",
			op: "supersetTool",
			params: {
				sourceSessionId: "session-1",
				name: "continue_in_new_session",
				arguments: {
					handoff: "Continue from the daemon integration test",
					focus: true,
					idempotencyKey: "daemon-e2e-continuation",
				},
			},
		});
		expect(continuation).toMatchObject({
			type: "response",
			id: "continue-session",
			ok: true,
			result: { workspaceId: "workspace-1", reused: false },
		});
		const childSessionId = (continuation.result as { sessionId: string })
			.sessionId;
		await waitFor(
			() =>
				openRequests.some(
					(event) =>
						event.sessionId === childSessionId &&
						event.sourceSessionId === "session-1",
				),
			"Superset session open request",
		);
		expect((await third.get(childSessionId)).workspaceId).toBe("workspace-1");
		stopOpenRequests();

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
