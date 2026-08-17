/**
 * ACP session router surface over the real host app: createTestHost boots
 * createApp against bun:sqlite with the deterministic fake adapter injected,
 * and every call round-trips through app.fetch as real tRPC (superjson,
 * auth middleware, zod inputs). Covers the pre-release feature gate (closed
 * by default; `list` feature-detects without erroring), the domain-error →
 * TRPC-code mapping, and a full create → prompt → poll → fold round trip —
 * the exact call sequence a mobile client makes over the relay.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	emptyTimeline,
	foldEnvelopes,
	type Timeline,
} from "@superset/session-protocol";
import { TRPCClientError } from "@trpc/client";
import { AcpSessionManager } from "../../src/runtime/acp-sessions";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

const FAKE_ADAPTER = path.join(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const WORKSPACE_ID = "acp-router-workspace";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Await a call that must reject with a TRPCClientError; return its code. */
async function trpcErrorCode(call: Promise<unknown>): Promise<string> {
	try {
		await call;
	} catch (error) {
		expect(error).toBeInstanceOf(TRPCClientError);
		if (error instanceof TRPCClientError) {
			return (error.data as { code?: string } | undefined)?.code ?? "";
		}
	}
	throw new Error("expected the call to reject");
}

function agentText(timeline: Timeline): string {
	return timeline.items
		.filter((item) => item.kind === "message" && item.role === "agent")
		.flatMap((item) => (item.kind === "message" ? item.blocks : []))
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("\n");
}

describe("acp-sessions router: gate closed (default host)", () => {
	test("list feature-detects enabled:false; gated procedures reject", async () => {
		const previous = process.env.SUPERSET_ACP_SESSIONS;
		delete process.env.SUPERSET_ACP_SESSIONS;
		let host: TestHost | undefined;
		try {
			host = await createTestHost();
			// The one probe clients already make: no error, just enabled: false.
			const page = await host.trpc.acpSessions.list.query({});
			expect(page).toEqual({ items: [], nextCursor: null, enabled: false });
			// Everything else is refused outright.
			expect(
				await trpcErrorCode(
					host.trpc.acpSessions.create.mutate({
						sessionId: "gate-closed",
						workspaceId: WORKSPACE_ID,
					}),
				),
			).toBe("PRECONDITION_FAILED");
			expect(
				await trpcErrorCode(
					host.trpc.acpSessions.get.query({ sessionId: "gate-closed" }),
				),
			).toBe("PRECONDITION_FAILED");
		} finally {
			if (previous === undefined) {
				delete process.env.SUPERSET_ACP_SESSIONS;
			} else {
				process.env.SUPERSET_ACP_SESSIONS = previous;
			}
			await host?.dispose();
		}
	}, 30_000);
});

describe("acp-sessions router: manager injected (gate open)", () => {
	const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-router-"));
	// Injecting the manager opens the gate (app.ts) — no env flag needed.
	const manager = new AcpSessionManager({
		resolveWorkspaceCwd: () => workspaceDir,
		adapterEntry: FAKE_ADAPTER,
	});
	let host: TestHost;

	beforeAll(async () => {
		host = await createTestHost({ acpSessions: manager });
	});

	afterAll(async () => {
		// app dispose() also disposes the injected manager (and its children).
		await host.dispose();
		try {
			rmSync(workspaceDir, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	});

	test("create → prompt → poll → getMessages round trip over real tRPC", async () => {
		const sessionId = "router-roundtrip";
		const created = await host.trpc.acpSessions.create.mutate({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		expect(created.status).toBe("idle");
		expect(created.currentMode?.currentModeId).toBe("bypassPermissions");

		const listed = await host.trpc.acpSessions.list.query({});
		expect(listed.enabled).toBe(true);
		expect(listed.items.some((item) => item.sessionId === sessionId)).toBe(
			true,
		);
		expect(listed.nextCursor).toBeNull();

		// prompt acks admission only; the turn's completion is never awaited on
		// the HTTP request — remote clients poll state (or ride the WS stream).
		const ack = await host.trpc.acpSessions.prompt.mutate({
			sessionId,
			prompt: [{ type: "text", text: "say hello over trpc" }],
		});
		expect(ack).toEqual({ accepted: true });

		const deadline = Date.now() + 10_000;
		let state = await host.trpc.acpSessions.get.query({ sessionId });
		while (!(state.status === "idle" && state.lastStopReason === "end_turn")) {
			if (Date.now() > deadline) {
				throw new Error("timed out waiting for the turn to land in state");
			}
			await sleep(25);
			state = await host.trpc.acpSessions.get.query({ sessionId });
		}
		expect(state.lastError).toBeNull();
		expect(typeof state.lastCompletedAt).toBe("number");

		const page = await host.trpc.acpSessions.getMessages.query({
			sessionId,
			limit: 200,
		});
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		expect(agentText(timeline)).toContain("hello over trpc");

		const completedAt = state.lastCompletedAt;
		await host.trpc.acpSessions.prompt.mutate({
			sessionId,
			prompt: [{ type: "text", text: "reject not admitted" }],
		});
		while (!state.lastError) {
			if (Date.now() > deadline) {
				throw new Error("timed out waiting for rejected turn state");
			}
			await sleep(25);
			state = await host.trpc.acpSessions.get.query({ sessionId });
		}
		expect(state.status).toBe("idle");
		expect(state.lastStopReason).toBeNull();
		expect(state.lastCompletedAt).toBe(completedAt);
	}, 30_000);

	test("domain errors map to TRPC codes", async () => {
		// Unknown session → NOT_FOUND.
		expect(
			await trpcErrorCode(
				host.trpc.acpSessions.get.query({ sessionId: "router-missing" }),
			),
		).toBe("NOT_FOUND");

		// Undecodable cursor → BAD_REQUEST, before the manager is consulted.
		expect(
			await trpcErrorCode(
				host.trpc.acpSessions.getMessages.query({
					sessionId: "router-missing",
					cursor: "not-a-cursor",
				}),
			),
		).toBe("BAD_REQUEST");

		// Malformed list cursor → BAD_REQUEST from the shared input schema,
		// instead of silently paginating to an empty page.
		expect(
			await trpcErrorCode(
				host.trpc.acpSessions.list.query({ cursor: "not-a-cursor" }),
			),
		).toBe("BAD_REQUEST");

		// Same session id in a different workspace → CONFLICT.
		await host.trpc.acpSessions.create.mutate({
			sessionId: "router-conflict",
			workspaceId: WORKSPACE_ID,
		});
		expect(
			await trpcErrorCode(
				host.trpc.acpSessions.create.mutate({
					sessionId: "router-conflict",
					workspaceId: "some-other-workspace",
				}),
			),
		).toBe("CONFLICT");
	}, 30_000);

	test("prompting a dead session maps to PRECONDITION_FAILED", async () => {
		const sessionId = "router-dead";
		await host.trpc.acpSessions.create.mutate({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		const pid = manager.adapterPid(sessionId);
		if (!pid) throw new Error("adapter pid unavailable");
		process.kill(pid, "SIGKILL");

		const deadline = Date.now() + 10_000;
		while (
			(await host.trpc.acpSessions.get.query({ sessionId })).status !== "dead"
		) {
			if (Date.now() > deadline) {
				throw new Error("timed out waiting for the session to report dead");
			}
			await sleep(25);
		}
		expect(
			await trpcErrorCode(
				host.trpc.acpSessions.prompt.mutate({
					sessionId,
					prompt: [{ type: "text", text: "say anyone home?" }],
				}),
			),
		).toBe("PRECONDITION_FAILED");
	}, 30_000);

	test("close removes the session from the router surface", async () => {
		const sessionId = "router-close";
		await host.trpc.acpSessions.create.mutate({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});

		await host.trpc.acpSessions.close.mutate({ sessionId });
		const listed = await host.trpc.acpSessions.list.query({});
		expect(listed.items.some((item) => item.sessionId === sessionId)).toBe(
			false,
		);
		expect(listed.nextCursor).toBeNull();
		expect(listed.enabled).toBe(true);
		expect(
			await trpcErrorCode(host.trpc.acpSessions.get.query({ sessionId })),
		).toBe("NOT_FOUND");
	}, 30_000);

	test("the surface requires host auth, list included", async () => {
		await expect(
			host.unauthenticatedTrpc.acpSessions.list.query({}),
		).rejects.toBeInstanceOf(TRPCClientError);
	}, 30_000);
});
