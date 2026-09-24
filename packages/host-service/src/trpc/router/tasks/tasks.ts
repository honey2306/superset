import {
	createTaskSchema,
	startConversationTaskSchema,
	taskGuidanceSchema,
	taskProfileSchema,
} from "@superset/shared/tasks";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { inspectDelivery } from "../../../tasks/delivery/git-io";
import { TaskConversationService } from "../../../tasks/task-conversation";
import { protectedProcedure, router } from "../../index";

const taskProcedure = protectedProcedure.use(({ ctx, next }) => {
	const runner = ctx.runtime.tasks;
	if (!runner)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Task execution is not available on this Host",
		});
	return next({ ctx: { ...ctx, taskRunner: runner } });
});
const executionProcedure = taskProcedure.use(({ ctx, next }) => {
	if (!ctx.runtime.acpSessionsEnabled)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Enable ACP sessions before starting managed tasks",
		});
	return next();
});
const runInput = z.object({ runId: z.string().uuid() });
export const tasksRouter = router({
	forSession: taskProcedure
		.input(z.object({ sessionId: z.string().min(1) }))
		.query(({ ctx, input }) =>
			new TaskConversationService(ctx.taskRunner, ctx.runtime.acpSessions).get(
				input.sessionId,
			),
		),
	startFromConversation: executionProcedure
		.input(startConversationTaskSchema)
		.mutation(({ ctx, input }) =>
			new TaskConversationService(
				ctx.taskRunner,
				ctx.runtime.acpSessions,
			).start(input),
		),
	releaseConversation: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) =>
			new TaskConversationService(
				ctx.taskRunner,
				ctx.runtime.acpSessions,
			).release(input.runId),
		),
	deliveryTargets: taskProcedure
		.input(z.object({ workspaceId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.get();
			if (!workspace) throw new Error("Workspace not found");
			return inspectDelivery(workspace.worktreePath);
		}),
	retryDelivery: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) => ctx.taskRunner.retryDelivery(input.runId)),
	reconcileDelivery: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) =>
			ctx.taskRunner.reconcileDelivery(input.runId),
		),
	revokeDelivery: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) => ctx.taskRunner.revokeDelivery(input.runId)),
	profile: taskProcedure
		.input(z.object({ projectId: z.string().min(1) }))
		.query(({ ctx, input }) =>
			ctx.taskRunner.store.profiles.get(input.projectId),
		),
	saveProfile: taskProcedure
		.input(
			z.object({
				projectId: z.string().min(1),
				expectedRevision: z.number().int().min(0),
				config: taskProfileSchema,
			}),
		)
		.mutation(({ ctx, input }) =>
			ctx.taskRunner.store.profiles.save(
				input.projectId,
				input.expectedRevision,
				input.config,
			),
		),
	discoverChecks: taskProcedure
		.input(z.object({ projectId: z.string().min(1) }))
		.query(({ ctx, input }) =>
			ctx.taskRunner.store.profiles.discover(input.projectId),
		),
	guide: executionProcedure
		.input(taskGuidanceSchema)
		.mutation(({ ctx, input }) => ctx.taskRunner.addGuidance(input)),
	remove: taskProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(({ ctx, input }) => ctx.taskRunner.store.removeTask(input.id)),
	list: taskProcedure.query(({ ctx }) => ctx.taskRunner.store.list()),
	get: taskProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(({ ctx, input }) => ctx.taskRunner.store.detail(input.id)),
	create: executionProcedure
		.input(createTaskSchema)
		.mutation(({ ctx, input }) => ctx.taskRunner.create(input)),
	pause: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) =>
			ctx.taskRunner.requestStop(input.runId, "paused"),
		),
	cancel: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) =>
			ctx.taskRunner.requestStop(input.runId, "cancelled"),
		),
	resume: executionProcedure
		.input(
			runInput.extend({
				instruction: z.string().trim().max(12_000).default(""),
			}),
		)
		.mutation(({ ctx, input }) =>
			ctx.taskRunner.resume(input.runId, input.instruction),
		),
	retry: executionProcedure
		.input(z.object({ taskId: z.string().uuid(), runId: z.string().uuid() }))
		.mutation(({ ctx, input }) =>
			ctx.taskRunner.retry(input.taskId, input.runId),
		),
	accept: taskProcedure
		.input(runInput)
		.mutation(({ ctx, input }) => ctx.taskRunner.accept(input.runId)),
});
