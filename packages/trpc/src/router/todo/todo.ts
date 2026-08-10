import { db, dbWs } from "@superset/db/client";
import {
	todos,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { dispatchTodo } from "./dispatch";
import { createTodoSchema, snoozeTodoSchema, updateTodoSchema } from "./schema";

async function verifyHostAccess(
	userId: string,
	organizationId: string,
	hostId: string,
): Promise<void> {
	const [host] = await db
		.select({ machineId: v2Hosts.machineId })
		.from(v2Hosts)
		.where(
			and(
				eq(v2Hosts.organizationId, organizationId),
				eq(v2Hosts.machineId, hostId),
			),
		)
		.limit(1);
	if (!host) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Host not found" });
	}

	const [membership] = await db
		.select({ hostId: v2UsersHosts.hostId })
		.from(v2UsersHosts)
		.where(
			and(
				eq(v2UsersHosts.userId, userId),
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.hostId, hostId),
			),
		)
		.limit(1);
	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have access to this host",
		});
	}
}

async function verifyProjectInOrg(
	organizationId: string,
	projectId: string,
): Promise<void> {
	const [project] = await db
		.select({ id: v2Projects.id, organizationId: v2Projects.organizationId })
		.from(v2Projects)
		.where(eq(v2Projects.id, projectId))
		.limit(1);
	if (!project) return;
	if (project.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
}

async function verifyWorkspaceInOrg(
	organizationId: string,
	workspaceId: string,
): Promise<{ id: string; projectId: string; hostId: string }> {
	const [workspace] = await db
		.select({
			id: v2Workspaces.id,
			organizationId: v2Workspaces.organizationId,
			projectId: v2Workspaces.projectId,
			hostId: v2Workspaces.hostId,
		})
		.from(v2Workspaces)
		.where(eq(v2Workspaces.id, workspaceId))
		.limit(1);
	if (!workspace || workspace.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
	return {
		id: workspace.id,
		projectId: workspace.projectId,
		hostId: workspace.hostId,
	};
}

async function getTodoForUser(
	userId: string,
	organizationId: string,
	id: string,
) {
	const [todo] = await db
		.select()
		.from(todos)
		.where(and(eq(todos.id, id), eq(todos.organizationId, organizationId)))
		.limit(1);
	if (!todo || todo.ownerUserId !== userId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Todo not found" });
	}
	return todo;
}

export const todoRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select()
			.from(todos)
			.where(
				and(
					eq(todos.organizationId, organizationId),
					eq(todos.ownerUserId, ctx.session.user.id),
				),
			)
			.orderBy(desc(todos.createdAt));
	}),

	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getTodoForUser(ctx.session.user.id, organizationId, input.id);
		}),

	create: protectedProcedure
		.input(createTodoSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			let projectId = input.v2ProjectId ?? null;
			let targetHostId = input.targetHostId ?? null;
			const workspaceId = input.v2WorkspaceId ?? null;

			if (workspaceId && !(targetHostId && projectId)) {
				const ws = await verifyWorkspaceInOrg(organizationId, workspaceId);
				projectId = projectId ?? ws.projectId;
				targetHostId = targetHostId ?? ws.hostId;
			} else if (projectId) {
				await verifyProjectInOrg(organizationId, projectId);
			}

			const [created] = await dbWs
				.insert(todos)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					title: input.title,
					note: input.note ?? null,
					mode: input.mode,
					dueAt: input.dueAt,
					timezone: input.timezone,
					v2ProjectId: projectId,
					v2WorkspaceId: workspaceId,
					targetHostId,
					agent: input.agent ?? null,
					prompt: input.prompt ?? null,
					status: "pending",
				})
				.returning();

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create todo",
				});
			}
			return created;
		}),

	update: protectedProcedure
		.input(updateTodoSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await getTodoForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			if (
				input.v2ProjectId !== undefined &&
				input.v2ProjectId !== null &&
				input.v2ProjectId !== existing.v2ProjectId
			) {
				await verifyProjectInOrg(organizationId, input.v2ProjectId);
			}

			const nextMode = input.mode ?? existing.mode;
			const nextAgent =
				input.agent === undefined ? existing.agent : input.agent;
			const nextPrompt =
				input.prompt === undefined ? existing.prompt : input.prompt;
			const nextHostId =
				input.targetHostId === undefined
					? existing.targetHostId
					: input.targetHostId;
			const nextProjectId =
				input.v2ProjectId === undefined
					? existing.v2ProjectId
					: input.v2ProjectId;
			const nextWorkspaceId =
				input.v2WorkspaceId === undefined
					? existing.v2WorkspaceId
					: input.v2WorkspaceId;

			if (nextMode === "auto") {
				if (
					!nextAgent ||
					!nextPrompt ||
					!nextHostId ||
					!(nextProjectId || nextWorkspaceId)
				) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"auto mode requires agent, prompt, targetHostId, and project or workspace",
					});
				}
			}

			const [updated] = await dbWs
				.update(todos)
				.set({
					title: input.title ?? existing.title,
					note: input.note === undefined ? existing.note : input.note,
					mode: nextMode,
					dueAt: input.dueAt ?? existing.dueAt,
					timezone: input.timezone ?? existing.timezone,
					v2ProjectId: nextProjectId,
					v2WorkspaceId: nextWorkspaceId,
					targetHostId: nextHostId,
					agent: nextAgent,
					prompt: nextPrompt,
				})
				.where(eq(todos.id, input.id))
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTodoForUser(ctx.session.user.id, organizationId, input.id);
			await dbWs.delete(todos).where(eq(todos.id, input.id));
			return { ok: true };
		}),

	complete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTodoForUser(ctx.session.user.id, organizationId, input.id);
			const [updated] = await dbWs
				.update(todos)
				.set({ status: "done", doneAt: new Date() })
				.where(eq(todos.id, input.id))
				.returning();
			return updated;
		}),

	cancel: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTodoForUser(ctx.session.user.id, organizationId, input.id);
			const [updated] = await dbWs
				.update(todos)
				.set({ status: "canceled" })
				.where(eq(todos.id, input.id))
				.returning();
			return updated;
		}),

	snooze: protectedProcedure
		.input(snoozeTodoSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTodoForUser(ctx.session.user.id, organizationId, input.id);
			const [updated] = await dbWs
				.update(todos)
				.set({
					dueAt: input.dueAt,
					status: "pending",
					notifiedAt: null,
					error: null,
				})
				.where(eq(todos.id, input.id))
				.returning();
			return updated;
		}),

	markNotified: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const todo = await getTodoForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);
			if (todo.notifiedAt) return todo;
			const [updated] = await dbWs
				.update(todos)
				.set({ notifiedAt: new Date() })
				.where(eq(todos.id, input.id))
				.returning();
			return updated;
		}),

	runNow: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const todo = await getTodoForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			if (todo.mode !== "auto") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "runNow only supported for auto-mode todos",
				});
			}

			const outcome = await dispatchTodo({ todo, relayUrl: env.RELAY_URL });
			if (outcome.status === "dispatch_failed") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: outcome.error,
				});
			}
			if (outcome.status === "skipped_offline") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: outcome.error,
				});
			}
			return { todoId: todo.id };
		}),
} satisfies TRPCRouterRecord;
