import { realpath } from "node:fs/promises";
import { isAcpHarness } from "@superset/shared/agent-catalog";
import {
	isTaskTerminal,
	startConversationTaskSchema,
	type TaskImage,
	taskContractSchema,
} from "@superset/shared/tasks";
import { eq } from "drizzle-orm";
import {
	delegationRuns,
	discussionRuns,
	tasks,
	workspaces,
} from "../db/schema";
import type { AcpSessionRuntime } from "../runtime/acp-sessions/runtime";
import type { TaskRunner } from "./task-runner";

/** Admission/release only, not another Agent loop. Reuse the conversation's
 * actual runtime/model/history. Ordinary input never implicitly starts a Task. */
export class TaskConversationService {
	constructor(
		private readonly runner: TaskRunner,
		private readonly sessions: AcpSessionRuntime,
	) {}
	get(sessionId: string) {
		const owned = this.runner.store.bySession(sessionId);
		const run = owned ?? this.runner.store.latestForSession(sessionId);
		if (!run) return null;
		const detail = this.runner.store.detail(run.taskId);
		return {
			...detail,
			run,
			checks: this.runner.store.checks(run.id),
			operations: this.runner.store.operations(run.id),
			guidance: this.runner.store.guidance.list(run.id),
			owned: Boolean(owned),
		};
	}
	async start(value: unknown) {
		const input = startConversationTaskSchema.parse(value),
			store = this.runner.store;
		const goal = input.prompt
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n")
			.trim();
		const attachments = input.prompt.filter(
			(block): block is TaskImage => block.type === "image",
		);
		// A network retry must return the original result even after its session
		// becomes running. Reconstruct exactly the initial request for conflict checks.
		const prior = store.db
			.select()
			.from(tasks)
			.where(eq(tasks.id, input.id))
			.get();
		if (prior) {
			const original = store
				.detail(prior.id)
				.runs.find(
					(run) =>
						run.iteration >= 0 &&
						run.fromConversation &&
						run.sessionId === input.sessionId,
				);
			if (!original)
				throw new Error("Task request id belongs to another conversation");
			return store.create({
				id: input.id,
				projectId: prior.projectId,
				workspaceId: prior.workspaceId,
				acceptanceMode: input.acceptanceMode,
				contract: taskContractSchema.parse({
					...original.contract,
					goal,
					acceptance: input.acceptance,
					strategy: input.strategy,
				}),
				conversation: { sessionId: input.sessionId, attachments },
			});
		}
		if (store.bySession(input.sessionId))
			throw new Error(
				"This conversation already owns a Task; finish/cancel it and return to chat before starting another",
			);
		if (!this.sessions.setTaskMode)
			throw new Error(
				"The Host must be updated before enabling Task mode in this conversation",
			);
		const state = await this.sessions.setTaskMode({
			sessionId: input.sessionId,
			mode: "inspect",
		});
		if (
			state.status !== "idle" ||
			state.pendingPermissions.length ||
			state.queuedPrompts.length
		)
			throw new Error(
				"Wait for the current conversation turn to finish before enabling Task mode",
			);
		if (!isAcpHarness(state.harness))
			throw new Error(
				"This conversation does not use a registered ACP runtime",
			);
		const workspace = store.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, state.workspaceId))
			.get();
		if (
			!workspace ||
			(await realpath(workspace.worktreePath)) !== (await realpath(state.cwd))
		)
			throw new Error(
				"The conversation directory does not match its registered project workspace",
			);
		const children = store.db
			.select()
			.from(delegationRuns)
			.where(eq(delegationRuns.parentSessionId, input.sessionId))
			.all();
		if (
			children.some(
				(child) =>
					!["completed", "failed", "cancelled", "interrupted"].includes(
						child.status,
					),
			)
		)
			throw new Error(
				"Finish the conversation's delegated work before adopting it as a managed Task",
			);
		const discussions = store.db
			.select()
			.from(discussionRuns)
			.where(eq(discussionRuns.sourceSessionId, input.sessionId))
			.all();
		if (
			discussions.some((item) =>
				["pending", "running", "waiting"].includes(item.status),
			)
		)
			throw new Error(
				"Finish the conversation's discussion before adopting it as a managed Task",
			);
		const option = state.configOptions.find(
			(item) =>
				item.category === "model" ||
				item.id === "model" ||
				item.name?.toLowerCase() === "model",
		);
		const model =
			typeof option?.currentValue === "string" && option.currentValue
				? option.currentValue
				: undefined;
		const result = await store.create({
			id: input.id,
			projectId: workspace.projectId,
			workspaceId: workspace.id,
			acceptanceMode: input.acceptanceMode,
			contract: taskContractSchema.parse({
				goal,
				acceptance: input.acceptance,
				strategy: input.strategy,
				harness: state.harness,
				...(model ? { model } : {}),
				delivery: { mode: "none" },
			}),
			conversation: { sessionId: input.sessionId, attachments },
		});
		this.runner.wake();
		return result;
	}
	async release(runId: string) {
		const store = this.runner.store,
			run = store.getRun(runId);
		if (run.sessionReleasedAt) return { released: true };
		if (
			!isTaskTerminal(run.status) ||
			run.leasePath ||
			this.runner.delivery.hasUnresolved(run)
		)
			throw new Error(
				"Finish or cancel this Task and reconcile outstanding operations before returning to ordinary chat",
			);
		if (!this.sessions.setTaskMode)
			throw new Error(
				"Conversation Task mode is not available on this runtime",
			);
		await this.sessions.setTaskMode({
			sessionId: run.sessionId,
			mode: "release",
			runId: run.id,
		});
		store.db.transaction(() => {
			const current = store.getRun(run.id);
			if (!isTaskTerminal(current.status) || current.leasePath)
				throw new Error("Task changed while releasing the conversation");
			store.patch(
				run.id,
				{ sessionReleasedAt: Date.now() },
				"Returned to ordinary chat; Task and conversation history retained",
			);
		});
		return { released: true };
	}
}
