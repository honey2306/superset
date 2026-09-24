import type { SessionScopedState } from "@superset/session-protocol";
import type { TaskImage } from "@superset/shared/tasks";
import type { AcpSessionRuntime } from "../runtime/acp-sessions/runtime";
import type { TaskRun } from "./task-store";

export interface TaskExecutionDriver {
	prepare(run: TaskRun, workspaceId: string): Promise<SessionScopedState>;
	submit(
		run: TaskRun,
		prompt: string,
		attachments?: TaskImage[],
	): Promise<void>;
	inspect(run: TaskRun): Promise<SessionScopedState>;
	cancel(run: TaskRun): Promise<void>;
	guide?(
		run: TaskRun,
		text: string,
		commandId: string,
		attachments?: TaskImage[],
	): Promise<"native" | "queued">;
	onChanged?(handler: () => void): () => void;
}

/** Reuse the existing isolated Pi SDK transport. No second model or agent loop.
 * The selected harness is explicit; every registered ACP engine keeps its own auth path. */
export class SessionTaskDriver implements TaskExecutionDriver {
	constructor(private readonly sessions: AcpSessionRuntime) {}
	async prepare(run: TaskRun, workspaceId: string) {
		if (run.fromConversation) {
			if (!this.sessions.setTaskMode)
				throw new Error("This runtime does not support conversation Task mode");
			const state = await this.sessions.setTaskMode({
				sessionId: run.sessionId,
				mode: "claim",
				runId: run.id,
			});
			if (
				state.workspaceId !== workspaceId ||
				state.harness !== run.contract.harness
			)
				throw new Error(
					"Conversation environment changed; refusing to move the Task",
				);
			return state;
		}
		return await this.sessions.create({
			sessionId: run.sessionId,
			workspaceId,
			harness: run.contract.harness,
			model: run.contract.model,
			strictModel: Boolean(run.contract.model),
			role: "task-executor",
		});
	}
	async submit(run: TaskRun, prompt: string, attachments: TaskImage[] = []) {
		await this.sessions.prompt({
			sessionId: run.sessionId,
			commandId: run.commandId,
			prompt: [{ type: "text", text: prompt }, ...attachments],
			displayPrompt: [
				{
					type: "text",
					text:
						run.iteration === 0
							? run.contract.goal
							: `[Task continuation ${run.iteration}] ${run.reason ?? "Continuing the existing goal"}`,
				},
				...attachments,
			],
		});
	}
	async inspect(run: TaskRun) {
		return await this.sessions.get(run.sessionId);
	}
	async cancel(run: TaskRun) {
		await this.sessions.clearQueue({ sessionId: run.sessionId });
		await this.sessions.cancel({ sessionId: run.sessionId });
	}
	async guide(
		run: TaskRun,
		text: string,
		commandId: string,
		attachments: TaskImage[] = [],
	): Promise<"native" | "queued"> {
		const state = await this.sessions.get(run.sessionId);
		if (state.status === "running" && state.canSteer) {
			await this.sessions.steerPrompt({
				sessionId: run.sessionId,
				commandId,
				prompt: [{ type: "text", text }, ...attachments],
			});
			return "native";
		}
		// ACP engines without a confirmed native acknowledgement keep the
		// existing, command-id-deduplicated Host follow-up queue.
		await this.sessions.enqueuePrompt({
			sessionId: run.sessionId,
			commandId,
			prompt: [{ type: "text", text }, ...attachments],
		});
		return "queued";
	}
	onChanged(handler: () => void) {
		return this.sessions.onSessionChanged?.(handler) ?? (() => {});
	}
}

export function isSessionQuiescent(state: SessionScopedState): boolean {
	return (
		(state.status === "idle" ||
			state.status === "offline" ||
			state.status === "dead") &&
		state.pendingPermissions.length === 0 &&
		state.queuedPrompts.length === 0
	);
}
