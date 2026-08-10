// End-to-end tests for initialCommand delivery. Long commands must survive the
// canonical-mode PTY input path, so they are staged as self-deleting scripts.

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	waitForTerminalCommandCompletion,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testHome = path.join(os.tmpdir(), `host-svc-initcmd-${process.pid}`);
const sock = path.join(os.tmpdir(), `host-svc-initcmd-${process.pid}.sock`);
const migrations = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let workspaceId: string;

before(async () => {
	fs.mkdirSync(testHome, { recursive: true });
	const worktreePath = path.join(testHome, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });
	server = new Server({ socketPath: sock, daemonVersion: "0.0.0-initcmd-e2e" });
	await server.listen();
	process.env.SUPERSET_PTY_DAEMON_SOCKET = sock;
	process.env.SUPERSET_HOME_DIR = testHome;
	process.env.HOST_SERVICE_VERSION = "0.0.0-initcmd-e2e";
	process.env.NODE_ENV = "development";
	__setAccountShellForTesting("/bin/sh");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? testHome,
		SHELL: "/bin/sh",
	});
	db = createDb(path.join(testHome, "host.db"), migrations);
	const projectId = randomUUID();
	workspaceId = randomUUID();
	db.insert(projects).values({ id: projectId, repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({ id: workspaceId, projectId, worktreePath, branch: "main" })
		.run();
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	await server.close();
	fs.rmSync(testHome, { recursive: true, force: true });
});

describe("initialCommand delivery", () => {
	test("a >2KB initialCommand executes fully and its 0600 script self-deletes", async () => {
		const terminalId = `e2e-longcmd-${randomUUID().slice(0, 8)}`;
		const outFile = path.join(testHome, `long-${terminalId}`);
		const launchDir = path.join(testHome, "launch scripts 'quoted'");
		const originalTmpdir = process.env.TMPDIR;
		fs.mkdirSync(launchDir, { recursive: true });
		process.env.TMPDIR = launchDir;
		const payload = `head-${"x".repeat(2400)}-tail`;
		const command = `printf '%s' '${payload}' > "${outFile}"`;
		assert.ok(Buffer.byteLength(command, "utf8") > 2048);
		try {
			const session = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				initialCommand: command,
			});
			assert.ok(!("error" in session), JSON.stringify(session));
			if ("error" in session) return;
			const staged = () =>
				fs
					.readdirSync(launchDir)
					.filter((name) => name.startsWith(`superset-launch-${terminalId}`));
			await waitFor(() => staged().length === 1, 5_000);
			const scriptName = staged()[0];
			assert.ok(scriptName);
			const scriptPath = path.join(launchDir, scriptName);
			assert.equal(fs.statSync(scriptPath).mode & 0o777, 0o600);
			assert.match(
				fs.readFileSync(scriptPath, "utf8"),
				/^command rm -f -- '.*'\n/,
			);
			await waitFor(
				() =>
					fs.existsSync(outFile) &&
					fs.readFileSync(outFile, "utf8") === payload,
				10_000,
			);
			assert.deepEqual(staged(), []);
			await disposeSessionAndWait(terminalId, db);
		} finally {
			if (originalTmpdir === undefined) delete process.env.TMPDIR;
			else process.env.TMPDIR = originalTmpdir;
		}
	});

	test("staging failure falls back to typing a sub-MAX_CANON command", async () => {
		const terminalId = `e2e-fallback-${randomUUID().slice(0, 8)}`;
		const outFile = path.join(testHome, `fallback-${terminalId}`);
		const payload = `fb-${"y".repeat(540)}-fb`;
		const command = `printf '%s' '${payload}' > "${outFile}"`;
		assert.ok(Buffer.byteLength(command, "utf8") > 512);
		assert.ok(Buffer.byteLength(command, "utf8") < 1000);
		const originalTmpdir = process.env.TMPDIR;
		process.env.TMPDIR = path.join(testHome, "missing", "nested");
		try {
			const session = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				initialCommand: command,
			});
			assert.ok(!("error" in session), JSON.stringify(session));
			if ("error" in session) return;
			await waitFor(
				() =>
					fs.existsSync(outFile) &&
					fs.readFileSync(outFile, "utf8") === payload,
				10_000,
			);
		} finally {
			if (originalTmpdir === undefined) delete process.env.TMPDIR;
			else process.env.TMPDIR = originalTmpdir;
			await disposeSessionAndWait(terminalId, db);
		}
	});

	test("pre-Enter teardown unlinks a staged script and never runs it", async () => {
		const terminalId = `e2e-cleanup-${randomUUID().slice(0, 8)}`;
		const sentinel = path.join(testHome, `cleanup-ran-${terminalId}`);
		const command = `echo ran > "${sentinel}" # ${"z".repeat(600)}`;
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: command,
		});
		assert.ok(!("error" in session), JSON.stringify(session));
		if ("error" in session) return;
		const staged = () =>
			fs
				.readdirSync(os.tmpdir())
				.filter((name) => name.startsWith(`superset-launch-${terminalId}`));
		await waitFor(() => staged().length === 1, 5_000);
		await disposeSessionAndWait(terminalId, db);
		await waitFor(() => staged().length === 0, 5_000);
		await new Promise((resolve) => setTimeout(resolve, 700));
		assert.equal(fs.existsSync(sentinel), false);
	});

	test("short setup wrappers execute without staging and completion markers resolve", async () => {
		const terminalId = `e2e-shortcmd-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const marker = `__SUPERSET_SETUP_COMPLETE_${id}`;
		const outFile = path.join(testHome, `short-${terminalId}`);
		const command = `(echo run-${id} > "${outFile}"; exit 7); __superset_setup_exit=$?; printf '\\n${marker}:%s__\\n' "$__superset_setup_exit"`;
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: command,
		});
		assert.ok(!("error" in session), JSON.stringify(session));
		if ("error" in session) return;
		const completion = await waitForTerminalCommandCompletion({
			terminalId,
			marker,
			timeoutMs: 10_000,
		});
		assert.deepEqual(completion, { kind: "completed", exitCode: 7 });
		await waitFor(() => fs.existsSync(outFile), 10_000);
		assert.deepEqual(
			fs
				.readdirSync(os.tmpdir())
				.filter((name) => name.startsWith(`superset-launch-${terminalId}`)),
			[],
		);
		await disposeSessionAndWait(terminalId, db);
	});
});

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
