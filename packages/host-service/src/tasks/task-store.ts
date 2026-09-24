import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import type {
	TaskImage,
	TaskMetrics,
	TaskProfileSnapshot,
	TaskRequirement,
} from "@superset/shared/tasks";
import {
	isTaskTerminal,
	type TaskContract,
	taskCandidateSchema,
	taskEditSchema,
} from "@superset/shared/tasks";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	taskChecks,
	taskEvents,
	taskFileEdits,
	taskOperations,
	taskRuns,
	tasks,
	workspaces,
} from "../db/schema";
import { fingerprintWorktree } from "./checks/worktree-fingerprint";
import { TaskGuidanceStore } from "./task-guidance";
import { resolveTaskStrategy } from "./task-policy";
import { TaskProfileStore } from "./task-profile-store";

export type TaskRun = typeof taskRuns.$inferSelect;
export class TaskStore {
	recordEdit(sessionId: string, value: unknown) {
		const run = this.bySession(sessionId);
		if (
			!run ||
			!run.contract.delivery ||
			run.contract.delivery.mode === "none" ||
			isTaskTerminal(run.status)
		)
			return;
		const item = taskEditSchema.parse(value);
		this.db
			.insert(taskFileEdits)
			.values({ ...item, runId: run.id, createdAt: Date.now() })
			.onConflictDoNothing()
			.run();
	}
	edits(runId: string) {
		return this.db
			.select()
			.from(taskFileEdits)
			.where(eq(taskFileEdits.runId, runId))
			.orderBy(asc(taskFileEdits.id))
			.all();
	}
	operations(runId: string) {
		return this.db
			.select()
			.from(taskOperations)
			.where(eq(taskOperations.runId, runId))
			.orderBy(asc(taskOperations.createdAt))
			.all();
	}

	private readonly removing = new Set<string>();
	private readonly creating = new Map<string, number>();
	private scopeKeys(
		scope: { projectId: string } | { workspaceId: string },
	): string[] {
		if ("projectId" in scope) return [`project:${scope.projectId}`];
		const workspace = this.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scope.workspaceId))
			.get();
		return [
			`workspace:${scope.workspaceId}`,
			...(workspace ? [`project:${workspace.projectId}`] : []),
		];
	}
	removalReason(
		scope: { projectId: string } | { workspaceId: string },
	): string | null {
		if (
			this.scopeKeys(scope).some(
				(key) => this.removing.has(key) || (this.creating.get(key) ?? 0) > 0,
			)
		)
			return "A task creation or directory removal is in progress; retry after it finishes";
		const existing = this.db
			.select({ id: tasks.id })
			.from(tasks)
			.where(
				"projectId" in scope
					? eq(tasks.projectId, scope.projectId)
					: eq(tasks.workspaceId, scope.workspaceId),
			)
			.get();
		return existing
			? "This directory has managed task records. Cancel unfinished tasks and remove their task records in Agent Tasks before removing the directory/project. Conversation records are retained."
			: null;
	}
	reserveRemoval(
		scope: { projectId: string } | { workspaceId: string },
	): () => void {
		const reason = this.removalReason(scope);
		if (reason) throw new Error(reason);
		const keys = this.scopeKeys(scope);
		for (const key of keys) this.removing.add(key);
		return () => {
			for (const key of keys) this.removing.delete(key);
		};
	}
	removeTask(id: string) {
		return this.db.transaction(() => {
			const runs = this.db
				.select()
				.from(taskRuns)
				.where(eq(taskRuns.taskId, id))
				.all();
			if (runs.some((run) => !isTaskTerminal(run.status) || run.leasePath))
				throw new Error(
					"Cancel or finish every task run before removing its record",
				);
			for (const run of runs) {
				if (
					this.operations(run.id).some(
						(op) =>
							op.leaseKey ||
							op.status === "submitted" ||
							op.status === "unknown",
					)
				)
					throw new Error(
						"Reconcile unfinished Git delivery before removing task history",
					);
				this.db
					.delete(taskOperations)
					.where(eq(taskOperations.runId, run.id))
					.run();
			}
			this.db.delete(tasks).where(eq(tasks.id, id)).run();
			return { removed: true, conversationsRetained: true };
		});
	}
	readonly profiles: TaskProfileStore;
	readonly guidance: TaskGuidanceStore;
	constructor(readonly db: HostDb) {
		this.profiles = new TaskProfileStore(db);
		this.guidance = new TaskGuidanceStore(this);
	}
	list() {
		return this.db
			.select({ task: tasks, run: taskRuns })
			.from(tasks)
			.leftJoin(taskRuns, eq(tasks.currentRunId, taskRuns.id))
			.orderBy(desc(tasks.createdAt))
			.limit(200)
			.all();
	}
	getTask(id: string) {
		const task = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
		if (!task) throw new Error("Task not found");
		return task;
	}
	getRun(id: string): TaskRun {
		const run = this.db
			.select()
			.from(taskRuns)
			.where(eq(taskRuns.id, id))
			.get();
		if (!run) throw new Error("Task run not found");
		return run;
	}
	bySession(sessionId: string) {
		return this.db
			.select()
			.from(taskRuns)
			.where(
				and(
					eq(taskRuns.sessionId, sessionId),
					isNull(taskRuns.sessionReleasedAt),
				),
			)
			.get();
	}
	latestForSession(sessionId: string) {
		return this.db
			.select()
			.from(taskRuns)
			.where(eq(taskRuns.sessionId, sessionId))
			.orderBy(desc(taskRuns.createdAt))
			.get();
	}
	requirements(runId: string): TaskRequirement[] {
		const run = this.getRun(runId);
		return [
			{ id: "goal", description: run.contract.goal },
			...(run.contract.acceptance
				? [{ id: "acceptance", description: run.contract.acceptance }]
				: []),
			...this.guidance
				.list(run.id)
				.filter(
					(item) => item.kind === "constraint" && item.status !== "cancelled",
				)
				.map((item) => ({ id: `guidance:${item.id}`, description: item.text })),
		];
	}
	detail(id: string) {
		const task = this.getTask(id);
		const runs = this.db
			.select()
			.from(taskRuns)
			.where(eq(taskRuns.taskId, id))
			.orderBy(desc(taskRuns.createdAt))
			.all();
		const run = runs.find((item) => item.id === task.currentRunId) ?? null;
		return {
			task,
			run,
			runs,
			guidance: run ? this.guidance.list(run.id) : [],
			operations: run
				? this.operations(run.id).map(({ plan, ...op }) => ({
						...op,
						target: plan.remoteBranch ?? plan.ref,
						paths: plan.paths,
						parentOid: plan.parentOid,
						treeOid: plan.treeOid,
					}))
				: [],
			checks: run ? this.checks(run.id) : [],
			events: run
				? this.db
						.select()
						.from(taskEvents)
						.where(eq(taskEvents.runId, run.id))
						.orderBy(desc(taskEvents.id))
						.limit(100)
						.all()
						.reverse()
				: [],
		};
	}
	checks(runId: string) {
		return this.db
			.select()
			.from(taskChecks)
			.where(eq(taskChecks.runId, runId))
			.orderBy(asc(taskChecks.startedAt))
			.all();
	}
	active() {
		return this.db
			.select()
			.from(taskRuns)
			.where(
				and(
					ne(taskRuns.status, "succeeded"),
					ne(taskRuns.status, "failed"),
					ne(taskRuns.status, "cancelled"),
					ne(taskRuns.status, "paused"),
					ne(taskRuns.status, "awaiting_review"),
				),
			)
			.orderBy(asc(taskRuns.createdAt))
			.all();
	}
	event(runId: string, kind: string, message: string) {
		this.db
			.insert(taskEvents)
			.values({ runId, kind, message, createdAt: Date.now() })
			.run();
	}
	patch(
		id: string,
		patch: Partial<typeof taskRuns.$inferInsert>,
		event?: string,
	) {
		this.db.transaction(() => {
			const current = this.getRun(id);
			const now = Date.now();
			const nextPhase = patch.phase ?? current.phase,
				nextStatus = patch.status ?? current.status;
			const metrics = {
				preparingMs: 0,
				executingMs: 0,
				verifyingMs: 0,
				snapshotsMs: 0,
				deliveringMs: 0,
				...current.metrics,
				...patch.metrics,
			};
			const transition =
				nextPhase !== current.phase || nextStatus !== current.status;
			if (
				transition &&
				current.status === "running" &&
				current.phaseStartedAt
			) {
				const key =
					current.phase === "preparing"
						? "preparingMs"
						: current.phase === "executing"
							? "executingMs"
							: current.phase === "verifying"
								? "verifyingMs"
								: current.phase === "delivering"
									? "deliveringMs"
									: null;
				if (key) metrics[key] += Math.max(0, now - current.phaseStartedAt);
			}
			this.db
				.update(taskRuns)
				.set({
					...patch,
					metrics,
					...(transition
						? { phaseStartedAt: nextStatus === "running" ? now : null }
						: {}),
					updatedAt: now,
				})
				.where(eq(taskRuns.id, id))
				.run();
			if (event) this.event(id, patch.status ?? "changed", event);
		});
		return this.getRun(id);
	}
	async create(input: {
		id: string;
		projectId: string;
		workspaceId?: string;
		acceptanceMode?: "project" | "review" | "checks";
		expectedProfileRevision?: number;
		contract: TaskContract;
		// Internal-only admission: UI uses startFromConversation, never raw create.
		conversation?: { sessionId: string; attachments?: TaskImage[] };
	}) {
		const hash = createHash("sha256")
			.update(JSON.stringify(input))
			.digest("hex");
		const existing = this.db
			.select()
			.from(tasks)
			.where(eq(tasks.id, input.id))
			.get();
		if (existing) {
			if (existing.requestHash !== hash)
				throw new Error("Task request id was reused with different input");
			return this.detail(input.id);
		}
		const workspace = this.db
			.select()
			.from(workspaces)
			.where(
				input.workspaceId
					? and(
							eq(workspaces.id, input.workspaceId),
							eq(workspaces.projectId, input.projectId),
						)
					: and(
							eq(workspaces.projectId, input.projectId),
							eq(workspaces.type, "main"),
						),
			)
			.get();
		if (!workspace)
			throw new Error(
				"Select an existing local execution directory for this project",
			);
		const creationKeys = [
			`project:${input.projectId}`,
			`workspace:${workspace.id}`,
		];
		if (creationKeys.some((key) => this.removing.has(key)))
			throw new Error("Directory removal is in progress; task was not created");
		for (const key of creationKeys)
			this.creating.set(key, (this.creating.get(key) ?? 0) + 1);
		try {
			const cwd = await realpath(workspace.worktreePath);
			this.db.transaction(() => {
				// A concurrent identical create may have completed while realpath was pending.
				const prior = this.db
					.select()
					.from(tasks)
					.where(eq(tasks.id, input.id))
					.get();
				if (prior) {
					if (prior.requestHash !== hash)
						throw new Error("Task request id conflict");
					return;
				}
				if (
					input.expectedProfileRevision !== undefined &&
					this.profiles.get(input.projectId).revision !==
						input.expectedProfileRevision
				)
					throw new Error(
						"Project task profile changed; refresh its preview before creating the task",
					);
				const now = Date.now();
				this.db
					.insert(tasks)
					.values({
						id: input.id,
						projectId: input.projectId,
						workspaceId: workspace.id,
						title: input.contract.goal.split("\n")[0]?.slice(0, 120) || "Task",
						contract: input.contract,
						requestHash: hash,
						createdAt: now,
						updatedAt: now,
					})
					.run();
				this.insertRun(input.id, randomUUID(), cwd, {
					profile: input.acceptanceMode
						? this.profiles.get(input.projectId)
						: null,
					acceptanceMode: input.acceptanceMode ?? null,
					conversation: input.conversation,
				});
			});
			return this.detail(input.id);
		} finally {
			for (const key of creationKeys) {
				const count = (this.creating.get(key) ?? 1) - 1;
				if (count > 0) this.creating.set(key, count);
				else this.creating.delete(key);
			}
		}
	}
	insertRun(
		taskId: string,
		runId: string,
		cwd: string,
		defaults?: {
			profile: TaskProfileSnapshot | null;
			acceptanceMode: "project" | "review" | "checks" | null;
			conversation?: { sessionId: string; attachments?: TaskImage[] };
		},
	): TaskRun {
		return this.db.transaction(() => {
			const existing = this.db
				.select()
				.from(taskRuns)
				.where(eq(taskRuns.id, runId))
				.get();
			if (existing) {
				if (existing.taskId !== taskId)
					throw new Error("Run id belongs to another task");
				return existing;
			}
			const task = this.getTask(taskId);
			const priorRun = task.currentRunId
				? this.getRun(task.currentRunId)
				: null;
			if (task.currentRunId) {
				const current = this.getRun(task.currentRunId);
				if (!isTaskTerminal(current.status) || current.leasePath)
					throw new Error(
						"The previous run has not stopped; resume or cancel it first",
					);
			}
			const now = Date.now();
			this.db
				.insert(taskRuns)
				.values({
					id: runId,
					taskId,
					contract: task.contract,
					profile: defaults?.profile ?? priorRun?.profile ?? null,
					acceptanceMode:
						defaults?.acceptanceMode ?? priorRun?.acceptanceMode ?? null,
					effectiveStrategy: resolveTaskStrategy(task.contract),
					policyReason: "Initial strategy; no classifier model call",
					instruction: priorRun
						? this.guidance.context(priorRun.id) || null
						: null,
					sessionId: defaults?.conversation?.sessionId ?? randomUUID(),
					fromConversation: Boolean(defaults?.conversation),
					initialAttachments: defaults?.conversation?.attachments ?? null,
					cwd,
					commandId: `${runId}:0`,
					createdAt: now,
					updatedAt: now,
				})
				.run();
			this.db
				.update(tasks)
				.set({ currentRunId: runId, updatedAt: now })
				.where(eq(tasks.id, taskId))
				.run();
			this.event(
				runId,
				"queued",
				`Task queued; Pi is explicit; delivery: ${task.contract.delivery?.mode ?? "none"}`,
			);
			return this.getRun(runId);
		});
	}
	acquire(id: string): boolean {
		return this.db.transaction(() => {
			const run = this.getRun(id);
			if (run.desiredState !== "running" || isTaskTerminal(run.status))
				return false;
			if (run.leasePath) return true;
			const other = this.db
				.select({ id: taskRuns.id })
				.from(taskRuns)
				.where(eq(taskRuns.leasePath, run.cwd))
				.get();
			if (other) return false;
			this.db
				.update(taskRuns)
				.set({ leasePath: run.cwd })
				.where(and(eq(taskRuns.id, id), isNull(taskRuns.leasePath)))
				.run();
			return true;
		});
	}
	async reportCandidate(
		sessionId: string,
		value: unknown,
	): Promise<Record<string, unknown>> {
		const candidate = taskCandidateSchema.parse(value);
		const run = this.getRun(candidate.runId);
		if (run.sessionId !== sessionId)
			throw new Error("Task report belongs to a different session");
		if (
			run.iteration !== candidate.iteration ||
			run.revision !== candidate.revision ||
			run.phase !== "executing" ||
			run.desiredState !== "running" ||
			isTaskTerminal(run.status)
		)
			throw new Error("Task report is stale or the task is stopping");
		const requirementIds = new Set(
			this.requirements(run.id).map((item) => item.id),
		);
		const checkKeys = new Set([
			...run.contract.checks.map((_, i) => `task:${i}`),
			...(run.profile?.config.checks.map((check) => `project:${check.id}`) ??
				[]),
		]);
		for (const item of candidate.criteria ?? []) {
			if (!requirementIds.has(item.id))
				throw new Error(`Unknown task requirement: ${item.id}`);
			for (const key of item.checkIds)
				if (!checkKeys.has(key))
					throw new Error(`Unknown acceptance evidence reference: ${key}`);
		}
		for (const id of candidate.additionalCheckIds)
			if (!run.profile?.config.checks.some((check) => check.id === id))
				throw new Error(`Unknown project acceptance check: ${id}`);
		if (
			this.guidance
				.unresolved(run.id)
				.some((item) => item.status === "pending" || item.status === "unknown")
		)
			throw new Error(
				"User guidance is pending delivery; read get_task and wait for it before reporting completion",
			);
		const started = Date.now();
		const snapshot = await fingerprintWorktree(run.cwd);
		this.addSnapshotTime(run.id, Date.now() - started);
		this.db.transaction(() => {
			const current = this.getRun(run.id);
			if (
				current.iteration !== candidate.iteration ||
				current.revision !== candidate.revision ||
				current.phase !== "executing" ||
				current.desiredState !== "running"
			)
				throw new Error("Task changed while reporting");
			this.patch(
				run.id,
				{ candidate, candidateFingerprint: snapshot.fingerprint },
				"Agent submitted a candidate result; not yet verified",
			);
		});
		return { recorded: true, verified: false, outcome: candidate.outcome };
	}
	addSnapshotTime(runId: string, milliseconds: number) {
		this.db.transaction(() => {
			const run = this.getRun(runId);
			const metrics: TaskMetrics = {
				preparingMs: 0,
				executingMs: 0,
				verifyingMs: 0,
				snapshotsMs: 0,
				deliveringMs: 0,
				...run.metrics,
			};
			metrics.snapshotsMs += milliseconds;
			this.db
				.update(taskRuns)
				.set({ metrics })
				.where(eq(taskRuns.id, runId))
				.run();
		});
	}
	context(sessionId: string): Record<string, unknown> {
		const run = this.bySession(sessionId);
		if (!run) throw new Error("This session is not managed by a Task");
		return {
			runId: run.id,
			iteration: run.iteration,
			revision: run.revision,
			profile: run.profile,
			guidance: this.guidance
				.list(run.id)
				.map(({ revision, kind, text, status }) => ({
					revision,
					kind,
					text,
					status,
				})),
			contract: run.contract,
			requirements: this.requirements(run.id),
			selectedChecks: run.selectedChecks,
			status: run.status,
			desiredState: run.desiredState,
		};
	}
}
