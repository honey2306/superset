import { createHash } from "node:crypto";
import { parseRrule } from "@superset/shared/rrule";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import {
	localAutomationPromptVersions,
	localAutomationRuns,
	localAutomations,
	localTodos,
	projects,
	workspaces,
} from "../db/schema";
import {
	type AgentRunInput,
	runAgentInWorkspace,
} from "../trpc/router/agents/agents";
import type { HostServiceContext } from "../types";

export type LocalTaskContext = Pick<
	HostServiceContext,
	"db" | "eventBus" | "terminalAgentStore" | "runtime"
>;

function hash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export function parseMcpScope(value: string): string[] {
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) &&
			parsed.every((entry) => typeof entry === "string")
			? parsed
			: [];
	} catch {
		return [];
	}
}

export function automationDto(row: typeof localAutomations.$inferSelect) {
	return {
		...row,
		dtstart: new Date(row.dtstart),
		nextRunAt: new Date(row.nextRunAt),
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
		mcpScope: parseMcpScope(row.mcpScopeJson),
	};
}

export function todoDto(row: typeof localTodos.$inferSelect) {
	return {
		...row,
		dueAt: new Date(row.dueAt),
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
		notifiedAt: row.notifiedAt === null ? null : new Date(row.notifiedAt),
		dispatchedAt: row.dispatchedAt === null ? null : new Date(row.dispatchedAt),
		doneAt: row.doneAt === null ? null : new Date(row.doneAt),
	};
}

export function runDto(row: typeof localAutomationRuns.$inferSelect) {
	return {
		...row,
		scheduledFor: new Date(row.scheduledFor),
		createdAt: new Date(row.createdAt),
		dispatchedAt: row.dispatchedAt === null ? null : new Date(row.dispatchedAt),
	};
}

export function localRunDestination(
	workspaceId: string,
	result: { kind: "terminal" | "acp" | "chat"; sessionId: string },
) {
	return {
		workspaceId,
		sessionId: result.sessionId,
		sessionKind: result.kind,
	};
}

/**
 * Local schedules and auto todos are unattended jobs explicitly authorized to
 * run with full access. The public agents.run mutation cannot supply this
 * internal-only capability.
 */
export function automatedAgentRunInput(
	workspaceId: string,
	agent: string,
	prompt: string,
): AgentRunInput {
	return {
		workspaceId,
		agent,
		prompt,
		permissionMode: "full_access",
		respectPresetLaunchMode: true,
	};
}

export function recordPromptVersion(
	db: LocalTaskContext["db"],
	automationId: string,
	content: string,
	source: "create" | "edit" | "restore",
	restoredFromVersionId?: string,
) {
	const id = crypto.randomUUID();
	db.insert(localAutomationPromptVersions)
		.values({
			id,
			automationId,
			content,
			contentHash: hash(content),
			source,
			restoredFromVersionId: restoredFromVersionId ?? null,
		})
		.run();
	return id;
}

/**
 * Resolve the host-owned workspace for a local task. A caller's explicit pin
 * always wins; project-only tasks fall back to its main workspace, then the
 * oldest remaining workspace. This deliberately queries only host.db.
 */
export function resolveLocalWorkspaceId(
	db: LocalTaskContext["db"],
	explicitWorkspaceId: string | null,
	projectId: string | null,
): string | null {
	if (explicitWorkspaceId) return explicitWorkspaceId;
	if (!projectId) return null;
	const main = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), eq(workspaces.type, "main")),
		)
		.get();
	if (main) return main.id;
	return (
		db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(eq(workspaces.projectId, projectId))
			.orderBy(asc(workspaces.createdAt))
			.get()?.id ?? null
	);
}

/** Temporary is a direct task target; its backing main workspace is internal. */
export function isTemporaryProjectId(
	db: LocalTaskContext["db"],
	projectId: string | null,
): boolean {
	return (
		!!projectId &&
		!!db
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), eq(projects.kind, "temporary")))
			.get()
	);
}

/** Execute an automation entirely on this host; no relay/API is involved. */
export async function dispatchLocalAutomation(
	ctx: LocalTaskContext,
	automation: typeof localAutomations.$inferSelect,
	scheduledFor = Date.now(),
): Promise<{
	runId: string;
	workspaceId: string;
	sessionId: string;
	sessionKind: "terminal" | "acp" | "chat";
}> {
	const runId = crypto.randomUUID();
	const workspaceId = resolveLocalWorkspaceId(
		ctx.db,
		automation.workspaceId,
		automation.projectId,
	);
	if (
		workspaceId &&
		workspaceId !== automation.workspaceId &&
		!isTemporaryProjectId(ctx.db, automation.projectId)
	) {
		ctx.db
			.update(localAutomations)
			.set({ workspaceId: workspaceId, updatedAt: Date.now() })
			.where(eq(localAutomations.id, automation.id))
			.run();
	}
	try {
		ctx.db
			.insert(localAutomationRuns)
			.values({
				id: runId,
				automationId: automation.id,
				title: automation.name,
				scheduledFor,
				workspaceId: workspaceId,
				status: "dispatching",
			})
			.run();
	} catch {
		throw new Error("A run for this automation is already in progress.");
	}

	if (!workspaceId) {
		const error = "A local workspace is required to run this automation.";
		ctx.db
			.update(localAutomationRuns)
			.set({ status: "dispatch_failed", error })
			.where(eq(localAutomationRuns.id, runId))
			.run();
		throw new Error(error);
	}
	try {
		const result = await runAgentInWorkspace(
			ctx as HostServiceContext,
			automatedAgentRunInput(workspaceId, automation.agent, automation.prompt),
		);
		ctx.db
			.update(localAutomationRuns)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				// ACP sessions share the durable session-id slot formerly used by
				// chat. `sessionKind` disambiguates it for renderer deep links.
				chatSessionId:
					result.kind === "chat" || result.kind === "acp"
						? result.sessionId
						: null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				dispatchedAt: Date.now(),
			})
			.where(eq(localAutomationRuns.id, runId))
			.run();
		return { runId, ...localRunDestination(workspaceId, result) };
	} catch (cause) {
		const error =
			cause instanceof Error ? cause.message : "Local dispatch failed";
		ctx.db
			.update(localAutomationRuns)
			.set({ status: "dispatch_failed", error })
			.where(eq(localAutomationRuns.id, runId))
			.run();
		throw new Error(error);
	}
}

export async function dispatchLocalTodo(
	ctx: LocalTaskContext,
	todo: typeof localTodos.$inferSelect,
): Promise<{
	workspaceId: string;
	sessionId: string;
	sessionKind: "terminal" | "acp" | "chat";
}> {
	const workspaceId = resolveLocalWorkspaceId(
		ctx.db,
		todo.workspaceId,
		todo.projectId,
	);
	if (todo.mode !== "auto" || !todo.agent || !todo.prompt || !workspaceId) {
		const error = "Auto todos require an agent, prompt, and local workspace.";
		ctx.db
			.update(localTodos)
			.set({ status: "dispatch_failed", error, updatedAt: Date.now() })
			.where(eq(localTodos.id, todo.id))
			.run();
		throw new Error(error);
	}
	if (
		workspaceId !== todo.workspaceId &&
		!isTemporaryProjectId(ctx.db, todo.projectId)
	) {
		ctx.db
			.update(localTodos)
			.set({ workspaceId: workspaceId, updatedAt: Date.now() })
			.where(eq(localTodos.id, todo.id))
			.run();
	}
	const claim = ctx.db
		.update(localTodos)
		.set({ status: "dispatching", error: null, updatedAt: Date.now() })
		.where(and(eq(localTodos.id, todo.id), eq(localTodos.status, "pending")))
		.run();
	if (claim.changes !== 1)
		throw new Error(
			"This todo has already been dispatched or is being dispatched.",
		);
	try {
		const result = await runAgentInWorkspace(
			ctx as HostServiceContext,
			automatedAgentRunInput(workspaceId, todo.agent, todo.prompt),
		);
		ctx.db
			.update(localTodos)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId:
					result.kind === "chat" || result.kind === "acp"
						? result.sessionId
						: null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				dispatchedAt: Date.now(),
				error: null,
				updatedAt: Date.now(),
			})
			.where(eq(localTodos.id, todo.id))
			.run();
		return localRunDestination(workspaceId, result);
	} catch (cause) {
		const error =
			cause instanceof Error ? cause.message : "Local dispatch failed";
		ctx.db
			.update(localTodos)
			.set({ status: "dispatch_failed", error, updatedAt: Date.now() })
			.where(eq(localTodos.id, todo.id))
			.run();
		throw new Error(error);
	}
}

export class LocalAutomationScheduler {
	private timer: ReturnType<typeof setInterval> | undefined;
	private running = false;

	constructor(private readonly ctx: () => LocalTaskContext) {}

	start() {
		this.timer = setInterval(() => void this.tick(), 30_000);
		this.timer.unref?.();
		void this.tick();
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
	}

	async tick(now = Date.now()) {
		if (this.running) return;
		this.running = true;
		try {
			const ctx = this.ctx();
			const dueTodos = ctx.db
				.select()
				.from(localTodos)
				.where(
					and(eq(localTodos.status, "pending"), lte(localTodos.dueAt, now)),
				)
				.orderBy(asc(localTodos.dueAt))
				.all();
			for (const todo of dueTodos) {
				if (todo.mode === "manual") {
					ctx.db
						.update(localTodos)
						.set({ status: "notified", updatedAt: now })
						.where(eq(localTodos.id, todo.id))
						.run();
					continue;
				}
				try {
					await dispatchLocalTodo(ctx, todo);
				} catch {
					/* durable failed todo status is already recorded */
				}
			}
			const due = ctx.db
				.select()
				.from(localAutomations)
				.where(
					and(
						eq(localAutomations.enabled, true),
						lte(localAutomations.nextRunAt, now),
					),
				)
				.orderBy(asc(localAutomations.nextRunAt))
				.all();
			for (const automation of due) {
				const nextRunAt = parseRrule({
					rrule: automation.rrule,
					dtstart: new Date(automation.dtstart),
					timezone: automation.timezone,
					// A delayed tick can be more than one occurrence behind. Advance
					// from the current tick instead of the stale scheduled time so the
					// next tick cannot re-dispatch the same overdue automation.
					after: new Date(Math.max(automation.nextRunAt, now)),
				}).nextRunAt.getTime();
				ctx.db
					.update(localAutomations)
					.set({ nextRunAt, updatedAt: now })
					.where(eq(localAutomations.id, automation.id))
					.run();
				try {
					await dispatchLocalAutomation(ctx, automation, automation.nextRunAt);
				} catch {
					/* durable failed run already recorded */
				}
			}
		} finally {
			this.running = false;
		}
	}
}

export { desc };
