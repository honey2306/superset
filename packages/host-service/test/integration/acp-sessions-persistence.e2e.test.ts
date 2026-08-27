/**
 * ACP session persistence e2e (fake adapter): the SQLite session registry
 * (SqliteAcpSessionPersistence over the real migrations) carried across
 * manager "restarts" — same DB handle, fresh AcpSessionManager — exercising
 * the offline status, ensureLive resurrection via the adapter's
 * session/load transcript replay, re-issued create() idempotency across a
 * restart, failed loads staying offline, the WS stream route resurrecting
 * on attach, and the tRPC router resurrecting through getMessages/prompt.
 */
import { Database as BunDatabase } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@agentclientprotocol/sdk";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
	type Timeline,
} from "@superset/session-protocol";
import {
	type SessionSubscription,
	subscribeToSession,
} from "@superset/session-protocol/client";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import {
	AcpSessionManager,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
	registerAcpSessionStreamRoute,
	SqliteAcpSessionPersistence,
} from "../../src/runtime/acp-sessions";
import { LAZY_MCP_CONFIG_ENV } from "../../src/runtime/acp-sessions/lazy-mcp";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

const FAKE_ADAPTER = path.join(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");
const WORKSPACE_ID = "acp-persist-workspace";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await sleep(10);
	}
}

function messageText(timeline: Timeline, role: "agent" | "user"): string {
	return timeline.items
		.filter((item) => item.kind === "message" && item.role === role)
		.flatMap((item) => (item.kind === "message" ? item.blocks : []))
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("\n");
}

function expectGapless(envelopes: SessionUpdateEnvelope[]): void {
	expect(envelopes.length).toBeGreaterThan(0);
	expect(envelopes[0]?.seq).toBe(1);
	for (let i = 1; i < envelopes.length; i += 1) {
		expect(envelopes[i]?.seq).toBe((envelopes[i - 1]?.seq ?? 0) + 1);
	}
}

describe("acp-sessions persistence e2e (fake adapter)", () => {
	const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-persist-"));
	// One bun:sqlite handle for the whole suite: a "restart" is a fresh
	// AcpSessionManager over the same persistence — anything a new manager
	// sees must have come from the DB rows, never from manager memory.
	const sqlite = new BunDatabase(":memory:");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	const persistence = new SqliteAcpSessionPersistence(db);

	const managers: AcpSessionManager[] = [];
	const servers: ServerType[] = [];
	const subscriptions: SessionSubscription[] = [];
	const hosts: TestHost[] = [];

	function newManager(options?: {
		journalCapacity?: number;
		idleHibernateMs?: number | null;
		mcpServers?: McpServer[];
		adapterEnv?: Record<string, string>;
		piAdapterEntry?: string;
	}) {
		const manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
			adapterEntry: FAKE_ADAPTER,
			piAdapterEntry: options?.piAdapterEntry,
			persistence,
			journalCapacity: options?.journalCapacity,
			idleHibernateMs: options?.idleHibernateMs,
			mcpServers: options?.mcpServers,
			adapterEnv: options?.adapterEnv,
		});
		managers.push(manager);
		return manager;
	}

	async function startServer(manager: AcpSessionManager): Promise<string> {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
		registerAcpSessionStreamRoute({
			app,
			sessions: manager,
			upgradeWebSocket,
		});
		const started = await new Promise<ServerType>((resolve) => {
			const instance = serve({ fetch: app.fetch, port: 0 }, () =>
				resolve(instance),
			);
		});
		injectWebSocket(started);
		servers.push(started);
		const { port } = started.address() as AddressInfo;
		return `ws://127.0.0.1:${port}`;
	}

	/** Run one scripted turn and wait for it to land. */
	async function runTurn(
		manager: AcpSessionManager,
		sessionId: string,
		text: string,
	): Promise<void> {
		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text }],
		});
		const { stopReason } = await turn;
		expect(stopReason).toBe("end_turn");
	}

	function foldedMessages(
		manager: AcpSessionManager,
		sessionId: string,
	): Timeline {
		const page = manager.getMessages({ sessionId, limit: 500 });
		return foldEnvelopes(emptyTimeline(), page.items);
	}

	afterAll(async () => {
		for (const subscription of subscriptions.splice(0)) {
			subscription.close();
		}
		for (const server of servers.splice(0)) {
			(
				server as unknown as { closeAllConnections?: () => void }
			).closeAllConnections?.();
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		}
		for (const host of hosts.splice(0)) {
			await host.dispose();
		}
		await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
		sqlite.close();
		try {
			rmSync(workspaceDir, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	});

	test("a session survives a manager restart: offline in list, resurrected by ensureLive with the replayed transcript", async () => {
		const sessionId = "persist-restart";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say hello before restart");
		await runTurn(before, sessionId, "title Persisted Title");
		const stateBefore = before.get(sessionId);
		expect(stateBefore.title).toBe("Persisted Title");
		await before.dispose();

		const after = newManager();
		// Passive reads see the registry row, not a process.
		const listed = after
			.list({})
			.items.find((state) => state.sessionId === sessionId);
		if (!listed) throw new Error("restarted manager lost the session");
		expect(listed.status).toBe("offline");
		expect(listed.title).toBe("Persisted Title");
		expect(listed.lastStopReason).toBe("end_turn");
		expect(listed.createdAt).toBe(stateBefore.createdAt);
		expect(after.get(sessionId).status).toBe("offline");
		// Durable history is readable without waking a native adapter.
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"hello before restart",
		);
		expect(after.get(sessionId).status).toBe("offline");

		// ensureLive is idempotent under concurrency (deduped like create) and
		// a no-op for ids the registry has never seen.
		await Promise.all([
			after.ensureLive(sessionId),
			after.ensureLive(sessionId),
			after.ensureLive("never-created"),
		]);
		const resurrected = after.get(sessionId);
		expect(resurrected.status).toBe("idle");
		expect(resurrected.title).toBe("Persisted Title");
		expect(resurrected.createdAt).toBe(stateBefore.createdAt);
		// On load the adapter comes back in bypassPermissions and Superset
		// keeps it there by default (no user-picked mode was persisted).
		expect(resurrected.currentMode?.currentModeId).toBe("bypassPermissions");
		// ensureLive on an already-live session must not respawn the adapter.
		const pid = after.adapterPid(sessionId);
		await after.ensureLive(sessionId);
		expect(after.adapterPid(sessionId)).toBe(pid);

		// session/load replayed the stored transcript — both sides of the
		// pre-restart conversation fold out of the fresh journal…
		const timeline = foldedMessages(after, sessionId);
		expect(messageText(timeline, "user")).toContain("say hello before restart");
		expect(messageText(timeline, "agent")).toContain("hello before restart");
		// …and the journal is a fresh gapless incarnation from seq 1.
		const replayed: SessionUpdateEnvelope[] = [];
		const unsubscribe = after.subscribe({
			sessionId,
			since: 0,
			onEnvelope: (envelope) => replayed.push(envelope),
		});
		expectGapless(replayed);
		unsubscribe();

		// The resurrected session takes new turns.
		await runTurn(after, sessionId, "say hello after restart");
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"hello after restart",
		);
	}, 30_000);

	test("replays one durable queued command after a Host restart", async () => {
		const sessionId = "persist-durable-queue";
		const commandId = "phone-queued-after-restart";
		const before = newManager({ idleHibernateMs: null });
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		const hanging = before.prompt({
			sessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		hanging.turn.catch(() => {});
		await waitFor(
			() => before.get(sessionId).status === "running",
			5_000,
			"the pre-restart turn to run",
		);

		const accepted = before.enqueuePrompt({
			sessionId,
			commandId,
			prompt: [{ type: "text", text: "say durable queue replay" }],
		});
		expect(accepted).toEqual({ queueId: commandId });
		expect(before.get(sessionId).queuedPrompts).toHaveLength(1);
		await before.dispose();

		const after = newManager({ idleHibernateMs: null });
		await Promise.all([
			after.ensureLive(sessionId),
			after.ensureLive(sessionId),
		]);
		await waitFor(
			() =>
				after
					.getMessages({ sessionId, limit: 500 })
					.items.some(
						(envelope) =>
							envelope.frame.kind === "update" &&
							envelope.frame.commandId === commandId &&
							envelope.frame.update.sessionUpdate === "user_message_chunk",
					),
			5_000,
			"the replayed command admission",
		);
		await waitFor(
			() =>
				after.get(sessionId).status === "idle" &&
				after.get(sessionId).lastStopReason === "end_turn",
			5_000,
			"the replayed command to finish",
		);

		const journal = persistence.loadJournal(
			sessionId,
			after.get(sessionId).epoch,
		);
		const commandUpdates = journal.filter(
			(envelope) =>
				envelope.frame.kind === "update" &&
				envelope.frame.commandId === commandId,
		);
		expect(commandUpdates).toHaveLength(1);
		expect(
			journal.filter(
				(envelope) =>
					envelope.frame.kind === "remote_command" &&
					envelope.frame.commandId === commandId,
			),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					frame: expect.objectContaining({ status: "queued" }),
				}),
				expect.objectContaining({
					frame: expect.objectContaining({ status: "started" }),
				}),
				expect.objectContaining({
					frame: expect.objectContaining({
						status: "finished",
						outcome: "admitted",
					}),
				}),
			]),
		);
		const timeline = foldedMessages(after, sessionId);
		expect(messageText(timeline, "agent")).toContain("durable queue replay");
	}, 30_000);

	test("hibernates only an unsubscribed, quiescent runtime and resumes it through session/load", async () => {
		const manager = newManager({ idleHibernateMs: 40 });
		const sessionId = "persist-idle-hibernate";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const unsubscribe = manager.subscribe({ sessionId, onEnvelope: () => {} });
		await sleep(90);
		expect(manager.get(sessionId).status).toBe("idle");

		unsubscribe();
		await sleep(15);
		const resubscribe = manager.subscribe({ sessionId, onEnvelope: () => {} });
		await sleep(90);
		expect(manager.get(sessionId).status).toBe("idle");
		resubscribe();
		// requireLive cancels the previous timer; this idle mutation must arm a
		// fresh one after it emits its updated state.
		await manager.setMode({ sessionId, modeId: "plan" });

		await waitFor(
			() => manager.get(sessionId).status === "offline",
			1_000,
			"idle session hibernation",
		);
		expect(
			manager.list({}).items.find((item) => item.sessionId === sessionId)
				?.status,
		).toBe("offline");

		await manager.ensureLive(sessionId);
		expect(manager.get(sessionId).status).toBe("idle");
		await runTurn(manager, sessionId, "say resumed after hibernation");
		expect(messageText(foldedMessages(manager, sessionId), "agent")).toContain(
			"resumed after hibernation",
		);
	}, 30_000);

	test("does not hibernate a running or permission-blocked session", async () => {
		const manager = newManager({ idleHibernateMs: 40 });
		const runningSessionId = "persist-hibernate-running";
		await manager.create({
			sessionId: runningSessionId,
			workspaceId: WORKSPACE_ID,
		});
		const { turn: hangingTurn } = manager.prompt({
			sessionId: runningSessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		await sleep(100);
		expect(manager.get(runningSessionId).status).toBe("running");
		await manager.cancel({ sessionId: runningSessionId });
		await hangingTurn;
		await waitFor(
			() => manager.get(runningSessionId).status === "offline",
			1_000,
			"completed running session hibernation",
		);

		const permissionSessionId = "persist-hibernate-permission";
		await manager.create({
			sessionId: permissionSessionId,
			workspaceId: WORKSPACE_ID,
		});
		const { turn: permissionTurn } = manager.prompt({
			sessionId: permissionSessionId,
			prompt: [{ type: "text", text: "permission deploy" }],
		});
		await waitFor(
			() => manager.get(permissionSessionId).pendingPermissions.length === 1,
			1_000,
			"permission request",
		);
		await sleep(100);
		expect(manager.get(permissionSessionId).status).toBe("awaiting_permission");
		const requestId =
			manager.get(permissionSessionId).pendingPermissions[0]?.requestId;
		if (!requestId) throw new Error("permission request id missing");
		manager.respondToPermission({
			sessionId: permissionSessionId,
			requestId,
			outcome: { outcome: "selected", optionId: "allow_once" },
		});
		await permissionTurn;
		await waitFor(
			() => manager.get(permissionSessionId).status === "offline",
			1_000,
			"resolved permission session hibernation",
		);
	}, 30_000);

	test("passes local MCP servers to both new and resumed ACP sessions", async () => {
		const sessionId = "persist-mcp-setup";
		const mcpRequestLog = path.join(workspaceDir, "mcp-requests.jsonl");
		const adapterEnv = { FAKE_ACP_MCP_REQUEST_LOG: mcpRequestLog };
		const mcpServers: McpServer[] = [
			{
				name: "browser-use",
				command: "/opt/local/bin/browser-use",
				args: ["--cli-mcp"],
				env: [],
			},
		];

		const before = newManager({ mcpServers, adapterEnv });
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say persist MCP setup");
		await before.dispose();

		const after = newManager({ mcpServers, adapterEnv });
		await after.ensureLive(sessionId);

		const requests = readFileSync(mcpRequestLog, "utf8")
			.trim()
			.split("\n")
			.map(
				(line) =>
					JSON.parse(line) as { phase: string; mcpServers: McpServer[] },
			);
		expect(requests.map(({ phase }) => phase)).toEqual(["new", "load"]);
		for (const request of requests) {
			const server = request.mcpServers[0];
			if (!server || !("command" in server))
				throw new Error("Expected wrapped stdio MCP server");
			expect(server).toMatchObject({
				name: "browser-use",
				command: process.execPath,
			});
			expect(server.args[0]?.endsWith("lazy-mcp-proxy.ts")).toBe(true);
			const serialized = server.env.find(
				({ name }) => name === LAZY_MCP_CONFIG_ENV,
			)?.value;
			const config = JSON.parse(serialized ?? "null") as {
				upstream?: McpServer;
				tools?: Array<{ name?: string }>;
			};
			expect(config.upstream).toEqual(mcpServers[0]);
			expect(config.tools?.map(({ name }) => name)).toEqual([
				"browser_exec",
				"browser_screenshot",
			]);
		}
	}, 30_000);

	test("asks Pi to skip native replay when durable history already exists", async () => {
		const sessionId = "persist-pi-skip-replay";
		const requestLog = path.join(workspaceDir, "pi-load-requests.jsonl");
		const options = {
			piAdapterEntry: FAKE_ADAPTER,
			adapterEnv: { FAKE_ACP_MCP_REQUEST_LOG: requestLog },
		};
		const before = newManager(options);
		await before.create({
			sessionId,
			workspaceId: WORKSPACE_ID,
			harness: "pi-acp",
		});
		await runTurn(before, sessionId, "say persisted Pi history");
		await before.dispose();

		const after = newManager(options);
		await after.ensureLive(sessionId);

		const requests = readFileSync(requestLog, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { phase: string; meta?: unknown });
		expect(requests.find((request) => request.phase === "load")?.meta).toEqual({
			"sh.superset/skipTranscriptReplay": true,
		});
	}, 30_000);

	test("session/load bounds its pre-runtime replay to the configured catch-up window", async () => {
		const sessionId = "persist-bounded-replay";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		for (let turn = 1; turn <= 6; turn += 1) {
			await runTurn(before, sessionId, `say replay-marker-${turn}`);
		}
		await before.dispose();

		const after = newManager({ journalCapacity: 4 });
		await after.ensureLive(sessionId);
		const page = after.getMessages({ sessionId, limit: 100 });
		expect(page.items.length).toBeLessThanOrEqual(4);
		const text = messageText(
			foldEnvelopes(emptyTimeline(), page.items),
			"agent",
		);
		expect(text).toContain("replay-marker-6");
		expect(text).not.toContain("replay-marker-1");
	}, 30_000);

	test("semantic transcript indexing uses the durable journal beyond the live ring", async () => {
		const sessionId = "persist-full-semantic-transcript";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		for (let turn = 1; turn <= 6; turn += 1) {
			await runTurn(before, sessionId, `say semantic-marker-${turn}`);
		}
		await before.dispose();

		const after = newManager({ journalCapacity: 4 });
		await after.ensureLive(sessionId);
		expect(
			after.getMessages({ sessionId, limit: 100 }).items.length,
		).toBeLessThanOrEqual(4);

		const latest = after.getTranscript({ sessionId, limit: 2 });
		expect(latest.totalTurns).toBe(6);
		expect(latest.index).toHaveLength(6);
		expect(latest.turns.map(({ turnNumber }) => turnNumber)).toEqual([5, 6]);
		expect(latest.nextCursor).not.toBeNull();

		const oldest = after.getTranscript({ sessionId, targetTurn: 1 });
		expect(oldest.turns).toHaveLength(1);
		expect(oldest.turns[0]?.turnNumber).toBe(1);
		expect(oldest.turns[0]?.userPreview).toContain("semantic-marker-1");
	}, 30_000);

	test("close permanently removes a live session and its durable recovery state", async () => {
		const sessionId = "persist-close";
		const manager = newManager();
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(manager, sessionId, "say delete-marker");

		await manager.close({ sessionId });
		expect(() => manager.get(sessionId)).toThrow(AcpSessionNotFoundError);
		expect(
			manager.list({}).items.map((state) => state.sessionId),
		).not.toContain(sessionId);
		expect(
			persistence.loadAll().map((record) => record.sessionId),
		).not.toContain(sessionId);

		const afterRestart = newManager();
		expect(() => afterRestart.get(sessionId)).toThrow(AcpSessionNotFoundError);
		expect(
			afterRestart.list({}).items.map((state) => state.sessionId),
		).not.toContain(sessionId);
	}, 30_000);

	test("create() re-issued after a restart resurrects the same adapter session; mismatched workspace conflicts", async () => {
		const sessionId = "persist-recreate";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say marker-one");
		await before.dispose();

		const after = newManager();
		await expect(
			after.create({ sessionId, workspaceId: "some-other-workspace" }),
		).rejects.toBeInstanceOf(AcpWorkspaceMismatchError);

		// The client's normal open flow — create, then read — needs no
		// explicit ensureLive: create resurrects.
		const created = await after.create({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		expect(created.status).toBe("idle");
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"marker-one",
		);
	}, 30_000);

	test("a missing upstream session starts fresh while retaining the durable Superset transcript", async () => {
		const sessionId = "persist-broken";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say doomed");
		await before.dispose();

		// Break the harness-side store (the fake's stand-in for Claude Code's
		// on-disk session files) for exactly this session.
		const record = persistence
			.loadAll()
			.find((row) => row.sessionId === sessionId);
		if (!record) throw new Error("registry row missing");
		rmSync(
			path.join(
				workspaceDir,
				".fake-acp-store",
				`${record.acpSessionId}.jsonl`,
			),
		);

		const after = newManager({
			adapterEnv: { FAKE_ACP_DESTROY_INPUT_ON_MISSING_LOAD: "1" },
		});
		await after.ensureLive(sessionId);

		// The adapter's native session was gone, but Superset's own journal stays
		// authoritative for the visible transcript.
		expect(after.get(sessionId).status).toBe("idle");
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"doomed",
		);
		await runTurn(after, sessionId, "say fresh-after-missing-upstream");
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"fresh-after-missing-upstream",
		);
		const replacementRecord = persistence
			.loadAll()
			.find((row) => row.sessionId === sessionId);
		expect(replacementRecord?.acpSessionId).not.toBe(record.acpSessionId);
	}, 30_000);

	test("a non-missing session/load error leaves the session offline", async () => {
		const sessionId = "persist-load-error";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await before.dispose();

		const after = newManager({
			adapterEnv: { FAKE_ACP_LOAD_ERROR: "1" },
		});
		await expect(after.ensureLive(sessionId)).rejects.toThrow(
			"Forced session/load failure",
		);
		expect(after.get(sessionId).status).toBe("offline");
	}, 30_000);

	test("a WS subscriber attaching to an offline session resurrects it and replays from seq 1", async () => {
		const sessionId = "persist-stream";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say stream-marker");
		await before.dispose();

		const after = newManager();
		expect(after.get(sessionId).status).toBe("offline");
		const baseUrl = await startServer(after);
		const received: SessionUpdateEnvelope[] = [];
		subscriptions.push(
			subscribeToSession({
				streamUrl: `${baseUrl}/acp-sessions/${sessionId}/stream`,
				since: 0,
				onEnvelope: (envelope) => received.push(envelope),
			}),
		);
		await waitFor(
			() =>
				received.some(
					(envelope) =>
						envelope.frame.kind === "update" &&
						envelope.frame.update.sessionUpdate === "agent_message_chunk",
				),
			10_000,
			"the replayed transcript over the stream",
		);
		expectGapless(received);
		const timeline = foldEnvelopes(
			emptyTimeline(),
			received.filter((envelope) => envelope.frame.kind !== "state"),
		);
		expect(messageText(timeline, "agent")).toContain("stream-marker");
		expect(after.get(sessionId).status).toBe("idle");
	}, 30_000);

	test("router: getMessages reads the durable journal without resurrecting; prompt resumes explicitly", async () => {
		const sessionId = "persist-router";
		const managerBefore = newManager();
		const hostBefore = await createTestHost({ acpSessions: managerBefore });
		await hostBefore.trpc.acpSessions.create.mutate({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		await hostBefore.trpc.acpSessions.prompt.mutate({
			sessionId,
			prompt: [{ type: "text", text: "say router-marker" }],
		});
		await waitFor(
			() => {
				const state = managerBefore.get(sessionId);
				return state.status === "idle" && state.lastStopReason === "end_turn";
			},
			10_000,
			"the pre-restart turn to land",
		);
		// Disposing the app kills the injected manager's adapter processes —
		// the host-restart half of the scenario.
		await hostBefore.dispose();

		const managerAfter = newManager();
		const hostAfter = await createTestHost({ acpSessions: managerAfter });
		hosts.push(hostAfter);

		const listed = await hostAfter.trpc.acpSessions.list.query({});
		expect(
			listed.items.find((state) => state.sessionId === sessionId)?.status,
		).toBe("offline");

		// A history fetch is passive: opening a tab must not spawn a native agent
		// or fail because its upstream history has gone away.
		const page = await hostAfter.trpc.acpSessions.getMessages.query({
			sessionId,
			limit: 200,
		});
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		expect(messageText(timeline, "agent")).toContain("router-marker");
		expect(
			(await hostAfter.trpc.acpSessions.get.query({ sessionId })).status,
		).toBe("offline");

		// Prompt is a live boundary, so it resurrects the adapter first.
		const ack = await hostAfter.trpc.acpSessions.prompt.mutate({
			sessionId,
			prompt: [{ type: "text", text: "say back from the dead" }],
		});
		expect(ack).toEqual({ accepted: true });
		await waitFor(
			() => {
				const state = managerAfter.get(sessionId);
				return state.status === "idle" && state.lastStopReason === "end_turn";
			},
			10_000,
			"the post-restart turn to land",
		);
	}, 30_000);
});
