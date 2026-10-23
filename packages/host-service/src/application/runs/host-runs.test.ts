import { expect, test } from "bun:test";
import type { DiscussionRun } from "@superset/session-protocol";
import { SqliteAcpSessionPersistence } from "../../runtime/acp-sessions/persistence";
import type { AcpSessionRuntime } from "../../runtime/acp-sessions/runtime";
import { eventually, taskFixture } from "../../tasks/test-fixture";
import {
	automationExecutionRun,
	createHostRunService,
	discussionExecutionRun,
} from "./host-runs";
import { RunService } from "./run-service";

test("Task cancellation uses its owner, survives reconstruction, and stays idempotent", async () => {
	const f = await taskFixture();
	try {
		await f.start();
		const service = () =>
			createHostRunService({
				db: f.db,
				runtime: {
					tasks: f.runner,
					acpSessions: {} as AcpSessionRuntime,
					acpSessionsEnabled: true,
				},
			});
		const ref = { kind: "task", id: f.runId } as const;
		expect(
			(await service().list({ workspaceId: f.workspaceId, limit: 20 }))[0]?.key,
		).toBe(`task:${f.runId}`);
		expect(
			await service().list({ workspaceId: "unrelated", limit: 20 }),
		).toEqual([]);
		expect(await service().stop(ref, "cancel")).toMatchObject({
			status: "stopping",
			completionPolicy: "task-acceptance",
		});
		await eventually(
			() => f.run().status === "cancelled",
			() => f.runner.tick(),
		);
		await f.restart();
		const before = f.driver.cancelCalls;
		expect(await service().get(ref)).toMatchObject({
			status: "cancelled",
			terminal: true,
		});
		await service().stop(ref, "cancel");
		expect(f.driver.cancelCalls).toBe(before);
	} finally {
		await f.close();
	}
});
test("dispatch results cannot be mistaken for accepted work or cancel a reused session", async () => {
	const run = automationExecutionRun({
		id: "same",
		automationId: "schedule",
		title: "Daily",
		workspaceId: "w",
		scheduledFor: 1,
		sessionKind: "acp",
		acpSessionId: "reused",
		terminalSessionId: null,
		status: "dispatched",
		error: null,
		dispatchedAt: 2,
		createdAt: 1,
	});
	let calls = 0;
	const service = new RunService([
		{
			kind: "automation",
			list: async () => [run],
			get: async () => run,
			stop: async () => {
				calls++;
			},
		},
	]);
	expect(run).toMatchObject({
		status: "dispatched",
		completionPolicy: "dispatch",
		result: { kind: "dispatch" },
	});
	await service.stop(run.ref, "cancel");
	expect(calls).toBe(0);
	await expect(service.get({ kind: "task", id: "same" })).rejects.toMatchObject(
		{ code: "PRECONDITION_FAILED" },
	);
});
test("discussion cancellation and durable result lookup use the coordinator boundary", async () => {
	const f = await taskFixture();
	let run: DiscussionRun = {
		id: "d",
		workspaceId: f.workspaceId,
		sourceSessionId: "s",
		topic: "Review",
		status: "running",
		currentRound: 1,
		maxRounds: 2,
		participants: [],
		rounds: [],
		finalPositions: [],
		failureMessage: null,
		createdAt: 1,
		updatedAt: 1,
		completedAt: null,
	};
	let stops = 0;
	try {
		const acp = {
			listDiscussions: async () => [run],
			getDiscussion: async ({ runId }: { runId: string }) =>
				runId === run.id ? run : null,
			stopDiscussion: async () => {
				stops++;
				run = { ...run, status: "cancelled", completedAt: 2 };
				return run;
			},
		} as unknown as AcpSessionRuntime;
		const service = () =>
			createHostRunService({
				db: f.db,
				runtime: { acpSessions: acp, acpSessionsEnabled: true },
			});
		await expect(
			service().stop({ kind: "discussion", id: "d" }, "pause"),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(
			await service().stop({ kind: "discussion", id: "d" }, "cancel"),
		).toMatchObject({ status: "cancelled" });
		await service().stop({ kind: "discussion", id: "d" }, "cancel");
		expect(stops).toBe(1);
		await expect(
			service().get({ kind: "discussion", id: "missing" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			discussionExecutionRun({
				...run,
				status: "failed",
				failureMessage: "Interrupted on daemon restart",
			}),
		).toMatchObject({
			terminal: true,
			recovery: "fail-interrupted",
			reason: "Interrupted on daemon restart",
		});
	} finally {
		await f.close();
	}
});

test("an older retained daemon keeps its pending work while Run lookup reads its durable record", async () => {
	const f = await taskFixture();
	try {
		const persistence = new SqliteAcpSessionPersistence(f.db);
		const run: DiscussionRun = {
			id: "legacy",
			workspaceId: f.workspaceId,
			sourceSessionId: "s",
			topic: "Pending discussion",
			status: "running",
			currentRound: 1,
			maxRounds: 2,
			participants: [],
			rounds: [],
			finalPositions: [],
			failureMessage: null,
			createdAt: 1,
			updatedAt: 1,
			completedAt: null,
		};
		persistence.upsertDiscussionRun(run);
		const acp = {
			listDiscussions: async () => [run],
			getDiscussion: async () => {
				throw new Error("Unsupported ACP daemon operation: getDiscussion");
			},
		} as unknown as AcpSessionRuntime;
		const service = createHostRunService({
			db: f.db,
			runtime: { acpSessions: acp, acpSessionsEnabled: true },
		});
		expect(
			await service.get({ kind: "discussion", id: "legacy" }),
		).toMatchObject({ status: "running", title: "Pending discussion" });
	} finally {
		await f.close();
	}
});
