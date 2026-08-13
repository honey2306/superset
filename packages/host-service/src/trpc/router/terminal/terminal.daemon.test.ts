// Tests for the `terminal.daemon` tRPC procedures.
//
// We exercise the wiring (procedure → supervisor delegation, env.ORGANIZATION_ID
// resolution) against a stubbed singleton supervisor, not a real spawn.
// Real spawn coverage is in src/daemon/DaemonSupervisor.node-test.ts.

import { beforeEach, describe, expect, mock, test } from "bun:test";
// We need to control what `getSupervisor()` returns AND what
// `waitForDaemonReady` does. The cleanest way is to install a stub
// supervisor into the singleton via `getSupervisor("...")` (which
// constructs lazily on first call) then monkey-patch the methods we
// care about.
import { __resetSupervisorForTesting, getSupervisor } from "../../../daemon";

// Make env.ORGANIZATION_ID resolvable. The env module reads from
// process.env at module load via @t3-oss/env-core, so we must set
// the var BEFORE importing.
process.env.ORGANIZATION_ID = "00000000-0000-4000-8000-000000000000";
process.env.HOST_SERVICE_SECRET = "test-secret";
process.env.HOST_DB_PATH = "/tmp/test-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/test-migrations";
process.env.AUTH_TOKEN = "test-auth-token";

const { appRouter } = await import("../router.ts");

const TEST_ORG_ID = "00000000-0000-4000-8000-000000000000";

function makeCaller(
	authenticated = true,
	overrides: Record<string, unknown> = {},
) {
	// Cast to whatever; daemon tests provide only the collaborators each
	// procedure touches.
	return appRouter.createCaller({
		isAuthenticated: authenticated,
		organizationId: TEST_ORG_ID,
		...overrides,
	} as unknown as Parameters<typeof appRouter.createCaller>[0]);
}

beforeEach(() => {
	__resetSupervisorForTesting();
});

describe("terminal.daemon tRPC procedures", () => {
	test("rejects with UNAUTHORIZED when ctx is unauthenticated", async () => {
		const caller = makeCaller(false);
		await expect(caller.terminal.daemon.getUpdateStatus()).rejects.toThrow(
			/Invalid or missing/,
		);
	});

	test("getUpdateStatus delegates to supervisor", async () => {
		const sup = getSupervisor("/nonexistent");
		const getUpdateStatusMock = mock(() => ({
			pending: true,
			running: "0.0.9",
			expected: "0.1.0",
			autoUpdateFailure: null,
		}));
		(
			sup as unknown as { getUpdateStatus: typeof sup.getUpdateStatus }
		).getUpdateStatus = getUpdateStatusMock as typeof sup.getUpdateStatus;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.getUpdateStatus();

		expect(getUpdateStatusMock).toHaveBeenCalledTimes(1);
		expect(getUpdateStatusMock).toHaveBeenCalledWith(
			"00000000-0000-4000-8000-000000000000",
		);
		expect(result).toEqual({
			pending: true,
			running: "0.0.9",
			expected: "0.1.0",
			autoUpdateFailure: null,
		});
	});

	test("listSessions awaits bootstrap before delegating", async () => {
		const sup = getSupervisor("/nonexistent");
		const order: string[] = [];

		const ensureMock = mock(async () => {
			order.push("ensure");
			await new Promise((r) => setTimeout(r, 30));
			return {} as Awaited<ReturnType<typeof sup.ensure>>;
		});
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;

		const listMock = mock(async () => {
			order.push("list");
			return [];
		});
		(sup as unknown as { listSessions: typeof sup.listSessions }).listSessions =
			listMock as typeof sup.listSessions;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.listSessions();

		expect(result).toEqual([]);
		// Bootstrap must have started before list resolved.
		expect(order[0]).toBe("ensure");
		expect(order).toContain("list");
	});

	test("listManagedSessions associates daemon sessions with durable rows", async () => {
		const sup = getSupervisor("/nonexistent");
		(sup as unknown as { ensure: typeof sup.ensure }).ensure = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		) as typeof sup.ensure;
		(sup as unknown as { listSessions: typeof sup.listSessions }).listSessions =
			mock(async () => [
				{ id: "managed", pid: 11, cols: 80, rows: 24, alive: true },
				{ id: "raw", pid: 12, cols: 100, rows: 30, alive: true },
			]) as typeof sup.listSessions;
		const caller = makeCaller(true, {
			db: {
				query: {
					terminalSessions: {
						findMany: () => ({
							sync: () => [
								{
									id: "managed",
									originWorkspaceId: "workspace-1",
									status: "active",
									createdAt: 10,
									lastAttachedAt: 20,
								},
							],
						}),
					},
				},
			},
		});

		const result = await caller.terminal.daemon.listManagedSessions();

		expect(result.sessions).toEqual([
			expect.objectContaining({
				sessionId: "managed",
				workspaceId: "workspace-1",
				managed: true,
			}),
			expect.objectContaining({
				sessionId: "raw",
				workspaceId: null,
				managed: false,
			}),
		]);
	});

	test("clearReplayBuffers targets every raw daemon session", async () => {
		const sup = getSupervisor("/nonexistent");
		(sup as unknown as { ensure: typeof sup.ensure }).ensure = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		) as typeof sup.ensure;
		(sup as unknown as { listSessions: typeof sup.listSessions }).listSessions =
			mock(async () => [
				{ id: "one", pid: 11, cols: 80, rows: 24, alive: true },
				{ id: "two", pid: 12, cols: 80, rows: 24, alive: true },
			]) as typeof sup.listSessions;
		const clearMock = mock(async () => ({ clearedCount: 2 }));
		(
			sup as unknown as {
				clearReplayBuffers: typeof sup.clearReplayBuffers;
			}
		).clearReplayBuffers = clearMock as typeof sup.clearReplayBuffers;

		const result = await makeCaller().terminal.daemon.clearReplayBuffers();

		expect(result).toEqual({ clearedCount: 2 });
		expect(clearMock).toHaveBeenCalledWith(TEST_ORG_ID, ["one", "two"]);
	});

	test("stop kills daemon sessions before stopping the supervisor", async () => {
		const sup = getSupervisor("/nonexistent");
		const order: string[] = [];
		(sup as unknown as { ensure: typeof sup.ensure }).ensure = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		) as typeof sup.ensure;
		let listed = false;
		(sup as unknown as { listSessions: typeof sup.listSessions }).listSessions =
			mock(async () => {
				order.push("list");
				if (listed) return [];
				listed = true;
				return [{ id: "session-1", pid: 11, cols: 80, rows: 24, alive: true }];
			}) as typeof sup.listSessions;
		(sup as unknown as { killSession: typeof sup.killSession }).killSession =
			mock(async () => {
				order.push("kill");
			}) as typeof sup.killSession;
		(sup as unknown as { stop: typeof sup.stop }).stop = mock(async () => {
			order.push("stop");
		}) as typeof sup.stop;
		const run = mock(() => {});
		const markTerminalExited = mock(() => {});

		await makeCaller(true, {
			db: {
				update: () => ({
					set: () => ({ where: () => ({ run }) }),
				}),
			},
			terminalAgentStore: { markTerminalExited },
		}).terminal.daemon.stop();

		expect(order).toEqual(["list", "kill", "list", "stop"]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(markTerminalExited).toHaveBeenCalledWith("session-1");
	});

	test("restart awaits bootstrap then delegates to supervisor.restart", async () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		);
		const restartMock = mock(async () => ({ success: true as const }));
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;
		(sup as unknown as { restart: typeof sup.restart }).restart =
			restartMock as typeof sup.restart;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.restart();

		expect(result).toEqual({ success: true });
		expect(restartMock).toHaveBeenCalledWith(
			"00000000-0000-4000-8000-000000000000",
		);
	});

	test("update delegates to supervisor.update with the org id", async () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		);
		const updateMock = mock(async () => ({
			ok: true as const,
			successorPid: 99999,
		}));
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;
		(sup as unknown as { update: typeof sup.update }).update =
			updateMock as typeof sup.update;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.update();

		expect(result).toEqual({ ok: true, successorPid: 99999 });
		expect(updateMock).toHaveBeenCalledWith(
			"00000000-0000-4000-8000-000000000000",
		);
	});

	test("update surfaces failure result without throwing", async () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		);
		const updateMock = mock(async () => ({
			ok: false as const,
			reason: "snapshot write failed: ENOSPC",
		}));
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;
		(sup as unknown as { update: typeof sup.update }).update =
			updateMock as typeof sup.update;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.update();

		expect(result.ok).toBe(false);
		expect(result.ok === false ? result.reason : "").toMatch(/ENOSPC/);
	});
});
