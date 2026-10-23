import { afterEach, expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionUpdateEnvelope } from "@superset/session-protocol";
import { AcpSessionManager } from "./acp-sessions";
import { MYFLICKER_RUNTIME_CONFIG_ID } from "./myflicker-runtime";
import type { AcpSessionPersistence, AcpSessionRecord } from "./persistence";

const directories: string[] = [];
const managers: AcpSessionManager[] = [];
afterEach(async () => {
	for (const manager of managers.splice(0)) await manager.dispose();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function fixture(taskOwned = false) {
	const directory = mkdtempSync(path.join(tmpdir(), "mf-runtime-"));
	directories.push(directory);
	const command = path.join(directory, "mf");
	const log = path.join(directory, "args.log");
	const fail = path.join(directory, "fail");
	const adapter = path.resolve(
		import.meta.dir,
		"../../../test/fixtures/fake-acp-adapter.ts",
	);
	writeFileSync(
		command,
		`#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nif [ -f '${fail}' ] && { [ "$2" = claude ] || [ "$(cat '${fail}')" = all ]; }; then exit 1; fi\nexec '${process.execPath}' '${adapter}'\n`,
	);
	chmodSync(command, 0o755);
	const records = new Map<string, AcpSessionRecord>();
	const entries: SessionUpdateEnvelope[] = [];
	const persistence: AcpSessionPersistence = {
		loadAll: () => [...records.values()],
		upsert: (record) => {
			records.set(record.sessionId, structuredClone(record));
		},
		loadJournal: (sessionId, epoch) =>
			structuredClone(
				entries.filter(
					(entry) => entry.sessionId === sessionId && entry.epoch === epoch,
				),
			),
		appendEnvelope: (entry) => {
			entries.push(structuredClone(entry));
		},
		reserveCommand: () => true,
		releaseCommand: () => {},
		deleteSession: (id) => {
			records.delete(id);
		},
	};
	const newManager = () => {
		const manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => directory,
			myflickerAdapterCommand: command,
			persistence,
			idleHibernateMs: null,
			startupTimeoutMs: 2_000,
			taskOwner: taskOwned
				? () => ({ id: "task-run", status: "running" })
				: undefined,
		});
		managers.push(manager);
		return manager;
	};
	return { newManager, records, log, fail, entries };
}

function backend(manager: AcpSessionManager) {
	return manager
		.get("mf-test")
		.configOptions.find((option) => option.id === MYFLICKER_RUNTIME_CONFIG_ID)
		?.currentValue;
}

async function create(manager: AcpSessionManager) {
	await manager.create({
		sessionId: "mf-test",
		workspaceId: "workspace",
		harness: "myflicker-acp",
	});
}

test("pins mf to MyFlicker and switches an empty conversation without losing its live stream", async () => {
	const f = fixture();
	const manager = f.newManager();
	await create(manager);
	expect(backend(manager)).toBe("myflicker");
	expect(readFileSync(f.log, "utf8")).toContain("--backend myflicker");
	const oldNativeId = f.records.get("mf-test")?.acpSessionId;
	const frames: SessionUpdateEnvelope[] = [];
	const unsubscribe = manager.subscribe({
		sessionId: "mf-test",
		onEnvelope: (entry) => frames.push(entry),
	});
	await manager.setConfigOption({
		sessionId: "mf-test",
		configId: MYFLICKER_RUNTIME_CONFIG_ID,
		value: "codex",
	});
	expect(backend(manager)).toBe("codex");
	expect(f.records.get("mf-test")?.acpSessionId).not.toBe(oldNativeId);
	expect(readFileSync(f.log, "utf8")).toContain("--backend codex");
	expect(frames.length).toBeGreaterThanOrEqual(2);
	for (let index = 1; index < frames.length; index++)
		expect(frames[index]?.seq).toBe((frames[index - 1]?.seq ?? 0) + 1);
	expect(frames.at(-1)?.frame).toMatchObject({
		kind: "state",
		state: { status: "idle" },
	});
	unsubscribe();
	const frameCount = frames.length;
	await manager.setConfigOption({
		sessionId: "mf-test",
		configId: "model",
		value: "fixture/model-b",
	});
	expect(frames).toHaveLength(frameCount);
	expect(backend(manager)).toBe("codex");
	await manager.dispose();
	const restored = f.newManager();
	await restored.ensureLive("mf-test");
	expect(backend(restored)).toBe("codex");
	expect(readFileSync(f.log, "utf8").trim().split("\n").at(-1)).toContain(
		"--backend codex",
	);
});

test("does not force a backend when resuming an older conversation without runtime metadata", async () => {
	const f = fixture();
	const manager = f.newManager();
	await create(manager);
	await manager.dispose();
	for (const entry of f.entries) {
		if (entry.frame.kind === "state") {
			entry.frame.state.configOptions = entry.frame.state.configOptions.filter(
				(option) => option.id !== MYFLICKER_RUNTIME_CONFIG_ID,
			);
		}
	}
	const restored = f.newManager();
	await restored.ensureLive("mf-test");
	expect(backend(restored)).toBeUndefined();
	expect(readFileSync(f.log, "utf8").trim().split("\n").at(-1)).not.toContain(
		"--backend",
	);
});

test("rolls back a failed runtime launch and preserves the previous selection", async () => {
	const f = fixture();
	const manager = f.newManager();
	await create(manager);
	writeFileSync(f.fail, "fail claude");
	await expect(
		manager.setConfigOption({
			sessionId: "mf-test",
			configId: MYFLICKER_RUNTIME_CONFIG_ID,
			value: "claude",
		}),
	).rejects.toThrow();
	expect(backend(manager)).toBe("myflicker");
	expect(manager.get("mf-test").status).toBe("idle");
});

test("reports a dead session rather than remaining on Starting when both launches fail", async () => {
	const f = fixture();
	const manager = f.newManager();
	await create(manager);
	writeFileSync(f.fail, "all");
	await expect(
		manager.setConfigOption({
			sessionId: "mf-test",
			configId: MYFLICKER_RUNTIME_CONFIG_ID,
			value: "claude",
		}),
	).rejects.toThrow("reconnect failed");
	expect(manager.get("mf-test").status).toBe("dead");
	expect(manager.get("mf-test").lastError).toContain("reopen");
	expect(f.records.has("mf-test")).toBe(true);
});

test("does not replace a runtime owned by a managed Task", async () => {
	const f = fixture(true);
	const manager = f.newManager();
	await create(manager);
	const initial = readFileSync(f.log, "utf8");
	await expect(
		manager.setConfigOption({
			sessionId: "mf-test",
			configId: MYFLICKER_RUNTIME_CONFIG_ID,
			value: "codex",
		}),
	).rejects.toThrow("before sending the first message");
	expect(readFileSync(f.log, "utf8")).toBe(initial);
});

test("rejects invalid runtime values without replacing the adapter", async () => {
	const f = fixture();
	const manager = f.newManager();
	await create(manager);
	const initial = readFileSync(f.log, "utf8");
	await expect(
		manager.setConfigOption({
			sessionId: "mf-test",
			configId: MYFLICKER_RUNTIME_CONFIG_ID,
			value: "arbitrary-command",
		}),
	).rejects.toThrow("Invalid MyFlicker");
	expect(readFileSync(f.log, "utf8")).toBe(initial);
});

test("never changes runtime once a conversation has messages", async () => {
	const f = fixture();
	const manager = f.newManager();
	await create(manager);
	await manager.prompt({
		sessionId: "mf-test",
		prompt: [{ type: "text", text: "hello" }],
	}).turn;
	const initial = readFileSync(f.log, "utf8");
	await expect(
		manager.setConfigOption({
			sessionId: "mf-test",
			configId: MYFLICKER_RUNTIME_CONFIG_ID,
			value: "codex",
		}),
	).rejects.toThrow("before sending the first message");
	expect(readFileSync(f.log, "utf8")).toBe(initial);
	expect(backend(manager)).toBe("myflicker");
});
