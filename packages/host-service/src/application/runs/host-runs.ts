import { type ExecutionRun, runKey } from "@superset/host-contract/runs";
import type { DiscussionRun } from "@superset/session-protocol";
import { isTaskTerminal, type TaskStatus } from "@superset/shared/tasks";
import { desc, eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { localAutomationRuns, taskRuns, tasks } from "../../db/schema";
import { SqliteAcpSessionPersistence } from "../../runtime/acp-sessions/persistence";
import type { HostServiceRuntime } from "../../types";
import { RunService, type RunSource } from "./run-service";

const taskStatuses: Record<TaskStatus, ExecutionRun["status"]> = {
	queued: "queued",
	running: "running",
	blocked: "waiting",
	pausing: "stopping",
	paused: "paused",
	cancelling: "stopping",
	recovering: "recovering",
	awaiting_review: "waiting",
	succeeded: "succeeded",
	failed: "failed",
	cancelled: "cancelled",
};
export function taskExecutionRun(
	run: typeof taskRuns.$inferSelect,
	task: typeof tasks.$inferSelect,
): ExecutionRun {
	const ref = { kind: "task", id: run.id } as const;
	const terminal = isTaskTerminal(run.status);
	return {
		ref,
		key: runKey(ref),
		workspaceId: task.workspaceId,
		ownerId: run.taskId,
		title: task.title,
		status: taskStatuses[run.status],
		phase: run.phase,
		terminal,
		completionPolicy: "task-acceptance",
		sessionIds: [run.sessionId],
		sourceSessionId: run.fromConversation ? run.sessionId : null,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		endedAt: run.endedAt,
		reason: run.reason,
		result:
			run.status === "succeeded"
				? {
						kind: "accepted",
						summary: run.reason,
						source: run.completionSource,
					}
				: null,
		capabilities: {
			cancel: !terminal,
			pause: !terminal && run.desiredState !== "cancelled",
		},
		recovery: "reconcile",
	};
}
export function automationExecutionRun(
	run: typeof localAutomationRuns.$inferSelect,
): ExecutionRun {
	const ref = { kind: "automation", id: run.id } as const;
	const status =
		run.status === "dispatched"
			? "dispatched"
			: run.status === "dispatch_failed"
				? "failed"
				: run.status === "dispatching"
					? "running"
					: "unknown";
	const sessionId = run.acpSessionId ?? run.terminalSessionId;
	return {
		ref,
		key: runKey(ref),
		workspaceId: run.workspaceId,
		ownerId: run.automationId,
		title: run.title,
		status,
		phase: run.status,
		terminal: status === "dispatched" || status === "failed",
		completionPolicy: "dispatch",
		sessionIds: sessionId ? [sessionId] : [],
		sourceSessionId: null,
		createdAt: run.createdAt,
		updatedAt: run.dispatchedAt ?? run.createdAt,
		endedAt: status === "dispatched" ? run.dispatchedAt : null,
		reason: run.error,
		result:
			status === "dispatched"
				? {
						kind: "dispatch",
						sessionId,
						sessionKind:
							run.sessionKind === "acp" || run.sessionKind === "terminal"
								? run.sessionKind
								: null,
					}
				: null,
		// The schedule owns dispatch, not the subsequent conversation. Cancelling
		// a session here could kill a user's newer turn; no such authority exists.
		capabilities: { cancel: false, pause: false },
		recovery: "dispatch-record",
	};
}
export function discussionExecutionRun(run: DiscussionRun): ExecutionRun {
	const ref = { kind: "discussion", id: run.id } as const;
	return {
		ref,
		key: runKey(ref),
		workspaceId: run.workspaceId,
		ownerId: run.sourceSessionId,
		title: run.topic,
		status: run.status === "completed" ? "succeeded" : run.status,
		phase: `round:${run.currentRound}/${run.maxRounds}`,
		terminal: run.status !== "running",
		completionPolicy: "discussion-rounds",
		sessionIds: run.participants.map((participant) => participant.sessionId),
		sourceSessionId: run.sourceSessionId,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		endedAt: run.completedAt,
		reason: run.failureMessage,
		result:
			run.status === "completed"
				? { kind: "discussion", positions: run.finalPositions }
				: null,
		capabilities: { cancel: run.status === "running", pause: false },
		recovery: "fail-interrupted",
	};
}

export function createHostRunService({
	db,
	runtime,
}: {
	db: HostDb;
	runtime: Pick<
		HostServiceRuntime,
		"tasks" | "acpSessions" | "acpSessionsEnabled"
	>;
}): RunService {
	const sources: RunSource[] = [
		{
			kind: "automation",
			async list(workspaceId, limit) {
				return db
					.select()
					.from(localAutomationRuns)
					.where(eq(localAutomationRuns.workspaceId, workspaceId))
					.orderBy(desc(localAutomationRuns.createdAt))
					.limit(limit)
					.all()
					.map(automationExecutionRun);
			},
			async get(id) {
				const run = db
					.select()
					.from(localAutomationRuns)
					.where(eq(localAutomationRuns.id, id))
					.get();
				return run ? automationExecutionRun(run) : null;
			},
		},
	];
	const taskRunner = runtime.tasks;
	if (taskRunner)
		sources.push({
			kind: "task",
			async list(workspaceId, limit) {
				return db
					.select({ run: taskRuns, task: tasks })
					.from(taskRuns)
					.innerJoin(tasks, eq(taskRuns.taskId, tasks.id))
					.where(eq(tasks.workspaceId, workspaceId))
					.orderBy(desc(taskRuns.createdAt))
					.limit(limit)
					.all()
					.map(({ run, task }) => taskExecutionRun(run, task));
			},
			async get(id) {
				const row = db
					.select({ run: taskRuns, task: tasks })
					.from(taskRuns)
					.innerJoin(tasks, eq(taskRuns.taskId, tasks.id))
					.where(eq(taskRuns.id, id))
					.get();
				return row ? taskExecutionRun(row.run, row.task) : null;
			},
			async stop(id, action) {
				taskRunner.requestStop(id, action === "pause" ? "paused" : "cancelled");
			},
		});
	const acp = runtime.acpSessions;
	const { listDiscussions, getDiscussion, stopDiscussion } = acp;
	if (runtime.acpSessionsEnabled && listDiscussions)
		sources.push({
			kind: "discussion",
			async list(workspaceId, limit) {
				return (await listDiscussions.call(acp, { workspaceId, limit })).map(
					discussionExecutionRun,
				);
			},
			async get(id) {
				let run: DiscussionRun | null;
				try {
					run = getDiscussion
						? await getDiscussion.call(acp, { runId: id })
						: new SqliteAcpSessionPersistence(db).getDiscussionRun(id);
				} catch (error) {
					// A retained older daemon may still own pending interactions.
					// Read its durable record instead of restarting live work merely
					// to enable the new read operation. All other failures propagate.
					if (
						!(error instanceof Error) ||
						error.message !== "Unsupported ACP daemon operation: getDiscussion"
					)
						throw error;
					run = new SqliteAcpSessionPersistence(db).getDiscussionRun(id);
				}
				return run ? discussionExecutionRun(run) : null;
			},
			...(stopDiscussion
				? {
						stop: async (id: string) => {
							await stopDiscussion.call(acp, { runId: id });
						},
					}
				: {}),
		});
	return new RunService(sources);
}
