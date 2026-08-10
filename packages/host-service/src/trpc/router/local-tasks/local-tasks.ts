import {
	describeSchedule,
	nextOccurrences,
	parseRrule,
} from "@superset/shared/rrule";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db/db";
import {
	localAutomationPromptVersions,
	localAutomationRuns,
	localAutomations,
	localTodos,
} from "../../../db/schema";
import {
	automationDto,
	dispatchLocalAutomation,
	dispatchLocalTodo,
	isTemporaryProjectId,
	recordPromptVersion,
	resolveLocalWorkspaceId,
	runDto,
	todoDto,
} from "../../../runtime/local-automations";
import { protectedProcedure, router } from "../../index";

const id = z.string().uuid();
const timezone = z
	.string()
	.min(1)
	.refine((value) => {
		try {
			new Intl.DateTimeFormat(undefined, { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}, "Invalid IANA timezone name");
const todoInput = z.object({
	title: z.string().trim().min(1).max(200),
	note: z.string().max(10_000).nullish(),
	mode: z.enum(["manual", "auto"]),
	dueAt: z.coerce.date(),
	timezone,
	v2ProjectId: id.nullish(),
	v2WorkspaceId: id.nullish(),
	targetHostId: z.string().min(1).nullish(),
	agent: z.string().min(1).max(200).nullish(),
	prompt: z.string().max(100_000).nullish(),
});
const automationInput = z.object({
	name: z.string().trim().min(1).max(200),
	prompt: z.string().trim().min(1).max(100_000),
	agent: z.string().min(1).max(200),
	targetHostId: z.string().min(1).nullish(),
	v2ProjectId: id.nullish(),
	v2WorkspaceId: id.nullish(),
	rrule: z.string().min(1).max(500),
	dtstart: z.coerce.date().optional(),
	timezone,
	mcpScope: z.array(z.string()).default([]),
});

function todoOrThrow(ctx: { db: HostDb }, todoId: string) {
	const row = ctx.db
		.select()
		.from(localTodos)
		.where(eq(localTodos.id, todoId))
		.get();
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "Todo not found" });
	return row;
}
function automationOrThrow(ctx: { db: HostDb }, automationId: string) {
	const row = ctx.db
		.select()
		.from(localAutomations)
		.where(eq(localAutomations.id, automationId))
		.get();
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "Automation not found" });
	return row;
}
function scheduleText(rrule: string) {
	try {
		return describeSchedule(rrule);
	} catch {
		return rrule;
	}
}
function automationResult(
	row: typeof localAutomations.$inferSelect,
	lastRun?: typeof localAutomationRuns.$inferSelect,
) {
	return {
		...automationDto(row),
		scheduleText: scheduleText(row.rrule),
		lastRun: lastRun ? runDto(lastRun) : null,
		lastRunStatus: lastRun?.status ?? null,
		lastRunAt: lastRun ? new Date(lastRun.createdAt) : null,
	};
}

export const todosRouter = router({
	list: protectedProcedure.query(({ ctx }) =>
		ctx.db
			.select()
			.from(localTodos)
			.orderBy(desc(localTodos.createdAt))
			.all()
			.map(todoDto),
	),
	get: protectedProcedure
		.input(z.object({ id }))
		.query(({ ctx, input }) => todoDto(todoOrThrow(ctx, input.id))),
	create: protectedProcedure.input(todoInput).mutation(({ ctx, input }) => {
		const workspaceId = resolveLocalWorkspaceId(
			ctx.db,
			input.v2WorkspaceId ?? null,
			input.v2ProjectId ?? null,
		);
		const storedWorkspaceId = isTemporaryProjectId(
			ctx.db,
			input.v2ProjectId ?? null,
		)
			? null
			: workspaceId;
		if (
			input.mode === "auto" &&
			(!input.agent || !input.prompt || !workspaceId)
		)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Auto todos require an agent, prompt, and local workspace.",
			});
		const now = Date.now();
		const row = {
			id: crypto.randomUUID(),
			title: input.title,
			note: input.note ?? null,
			mode: input.mode,
			dueAt: input.dueAt.getTime(),
			timezone: input.timezone,
			v2ProjectId: input.v2ProjectId ?? null,
			v2WorkspaceId: storedWorkspaceId,
			targetHostId: input.targetHostId ?? null,
			agent: input.agent ?? null,
			prompt: input.prompt ?? null,
			status: "pending",
			createdAt: now,
			updatedAt: now,
		};
		ctx.db.insert(localTodos).values(row).run();
		return todoDto(todoOrThrow(ctx, row.id));
	}),
	update: protectedProcedure
		.input(todoInput.partial().extend({ id }))
		.mutation(({ ctx, input }) => {
			const existing = todoOrThrow(ctx, input.id);
			const requestedWorkspaceId =
				input.v2WorkspaceId === undefined
					? existing.v2WorkspaceId
					: (input.v2WorkspaceId ?? null);
			const requestedProjectId =
				input.v2ProjectId === undefined
					? existing.v2ProjectId
					: (input.v2ProjectId ?? null);
			const workspaceId = resolveLocalWorkspaceId(
				ctx.db,
				requestedWorkspaceId,
				requestedProjectId,
			);
			const storedWorkspaceId = isTemporaryProjectId(ctx.db, requestedProjectId)
				? null
				: workspaceId;
			const next = {
				...existing,
				...input,
				dueAt: input.dueAt?.getTime() ?? existing.dueAt,
				note: input.note === undefined ? existing.note : (input.note ?? null),
				v2ProjectId: requestedProjectId,
				v2WorkspaceId: storedWorkspaceId,
				targetHostId:
					input.targetHostId === undefined
						? existing.targetHostId
						: (input.targetHostId ?? null),
				agent:
					input.agent === undefined ? existing.agent : (input.agent ?? null),
				prompt:
					input.prompt === undefined ? existing.prompt : (input.prompt ?? null),
				updatedAt: Date.now(),
			};
			if (next.mode === "auto" && (!next.agent || !next.prompt || !workspaceId))
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Auto todos require an agent, prompt, and local workspace.",
				});
			ctx.db
				.update(localTodos)
				.set(next)
				.where(eq(localTodos.id, input.id))
				.run();
			return todoDto(todoOrThrow(ctx, input.id));
		}),
	delete: protectedProcedure
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => {
			todoOrThrow(ctx, input.id);
			ctx.db.delete(localTodos).where(eq(localTodos.id, input.id)).run();
			return { ok: true };
		}),
	complete: protectedProcedure
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => {
			todoOrThrow(ctx, input.id);
			ctx.db
				.update(localTodos)
				.set({ status: "done", doneAt: Date.now(), updatedAt: Date.now() })
				.where(eq(localTodos.id, input.id))
				.run();
			return todoDto(todoOrThrow(ctx, input.id));
		}),
	cancel: protectedProcedure
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => {
			todoOrThrow(ctx, input.id);
			ctx.db
				.update(localTodos)
				.set({ status: "canceled", updatedAt: Date.now() })
				.where(eq(localTodos.id, input.id))
				.run();
			return todoDto(todoOrThrow(ctx, input.id));
		}),
	snooze: protectedProcedure
		.input(z.object({ id, dueAt: z.coerce.date() }))
		.mutation(({ ctx, input }) => {
			todoOrThrow(ctx, input.id);
			ctx.db
				.update(localTodos)
				.set({
					dueAt: input.dueAt.getTime(),
					status: "pending",
					error: null,
					updatedAt: Date.now(),
				})
				.where(eq(localTodos.id, input.id))
				.run();
			return todoDto(todoOrThrow(ctx, input.id));
		}),
	markNotified: protectedProcedure
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => {
			const current = todoOrThrow(ctx, input.id);
			if (current.notifiedAt !== null) return todoDto(current);
			ctx.db
				.update(localTodos)
				.set({ notifiedAt: Date.now(), updatedAt: Date.now() })
				.where(eq(localTodos.id, input.id))
				.run();
			return todoDto(todoOrThrow(ctx, input.id));
		}),
	runNow: protectedProcedure
		.input(z.object({ id }))
		.mutation(async ({ ctx, input }) => {
			const row = todoOrThrow(ctx, input.id);
			const result = await dispatchLocalTodo(ctx, row);
			return { todoId: row.id, ...result };
		}),
});

export const automationsRouter = router({
	list: protectedProcedure
		.input(z.object({ name: z.string().trim().min(1).optional() }).optional())
		.query(({ ctx, input }) => {
			const latestByAutomation = new Map<
				string,
				typeof localAutomationRuns.$inferSelect
			>();
			for (const run of ctx.db
				.select()
				.from(localAutomationRuns)
				.orderBy(desc(localAutomationRuns.createdAt))
				.all()) {
				if (!latestByAutomation.has(run.automationId))
					latestByAutomation.set(run.automationId, run);
			}
			return ctx.db
				.select()
				.from(localAutomations)
				.orderBy(desc(localAutomations.createdAt))
				.all()
				.filter(
					(row) =>
						!input?.name ||
						row.name.toLowerCase().includes(input.name.toLowerCase()),
				)
				.map((row) => automationResult(row, latestByAutomation.get(row.id)));
		}),
	get: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => {
		const row = automationOrThrow(ctx, input.id);
		const lastRun = ctx.db
			.select()
			.from(localAutomationRuns)
			.where(eq(localAutomationRuns.automationId, row.id))
			.orderBy(desc(localAutomationRuns.createdAt))
			.get();
		return automationResult(row, lastRun);
	}),
	create: protectedProcedure
		.input(automationInput)
		.mutation(({ ctx, input }) => {
			const now = Date.now();
			const dtstart = input.dtstart ?? new Date(now);
			const nextRunAt = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			}).nextRunAt.getTime();
			const workspaceId = resolveLocalWorkspaceId(
				ctx.db,
				input.v2WorkspaceId ?? null,
				input.v2ProjectId ?? null,
			);
			const storedWorkspaceId = isTemporaryProjectId(
				ctx.db,
				input.v2ProjectId ?? null,
			)
				? null
				: workspaceId;
			const row = {
				id: crypto.randomUUID(),
				name: input.name,
				prompt: input.prompt,
				agent: input.agent,
				targetHostId: input.targetHostId ?? null,
				v2ProjectId: input.v2ProjectId ?? null,
				v2WorkspaceId: storedWorkspaceId,
				rrule: input.rrule,
				dtstart: dtstart.getTime(),
				timezone: input.timezone,
				enabled: true,
				mcpScopeJson: JSON.stringify(input.mcpScope),
				nextRunAt,
				createdAt: now,
				updatedAt: now,
			};
			ctx.db.insert(localAutomations).values(row).run();
			recordPromptVersion(ctx.db, row.id, row.prompt, "create");
			return automationResult(automationOrThrow(ctx, row.id));
		}),
	update: protectedProcedure
		.input(automationInput.partial().omit({ prompt: true }).extend({ id }))
		.mutation(({ ctx, input }) => {
			const existing = automationOrThrow(ctx, input.id);
			const requestedProjectId =
				input.v2ProjectId === undefined
					? existing.v2ProjectId
					: (input.v2ProjectId ?? null);
			// Changing the direct target must not retain a workspace pin belonging
			// to the previous project. A null workspace intentionally means
			// "resolve this target's main workspace" (including temporary).
			const requestedWorkspaceId =
				input.v2WorkspaceId === undefined
					? input.v2ProjectId === undefined
						? existing.v2WorkspaceId
						: null
					: (input.v2WorkspaceId ?? null);
			const workspaceId = resolveLocalWorkspaceId(
				ctx.db,
				requestedWorkspaceId,
				requestedProjectId,
			);
			const storedWorkspaceId = isTemporaryProjectId(ctx.db, requestedProjectId)
				? null
				: workspaceId;
			const rrule = input.rrule ?? existing.rrule,
				dtstart = input.dtstart?.getTime() ?? existing.dtstart,
				zone = input.timezone ?? existing.timezone;
			const recurrenceChanged =
				input.rrule !== undefined ||
				input.dtstart !== undefined ||
				input.timezone !== undefined;
			const patch = {
				...input,
				v2ProjectId: requestedProjectId,
				v2WorkspaceId: storedWorkspaceId,
				dtstart,
				rrule,
				timezone: zone,
				nextRunAt: recurrenceChanged
					? parseRrule({
							rrule,
							dtstart: new Date(dtstart),
							timezone: zone,
						}).nextRunAt.getTime()
					: existing.nextRunAt,
				mcpScopeJson:
					input.mcpScope === undefined
						? existing.mcpScopeJson
						: JSON.stringify(input.mcpScope),
				updatedAt: Date.now(),
			};
			ctx.db
				.update(localAutomations)
				.set(patch)
				.where(eq(localAutomations.id, input.id))
				.run();
			return automationResult(automationOrThrow(ctx, input.id));
		}),
	delete: protectedProcedure
		.input(z.object({ id }))
		.mutation(({ ctx, input }) => {
			automationOrThrow(ctx, input.id);
			ctx.db
				.delete(localAutomations)
				.where(eq(localAutomations.id, input.id))
				.run();
			return { ok: true };
		}),
	setEnabled: protectedProcedure
		.input(z.object({ id, enabled: z.boolean() }))
		.mutation(({ ctx, input }) => {
			const current = automationOrThrow(ctx, input.id);
			const nextRunAt =
				input.enabled && !current.enabled
					? parseRrule({
							rrule: current.rrule,
							dtstart: new Date(current.dtstart),
							timezone: current.timezone,
							after: new Date(),
						}).nextRunAt.getTime()
					: current.nextRunAt;
			ctx.db
				.update(localAutomations)
				.set({ enabled: input.enabled, nextRunAt, updatedAt: Date.now() })
				.where(eq(localAutomations.id, input.id))
				.run();
			return automationResult(automationOrThrow(ctx, input.id));
		}),
	getPrompt: protectedProcedure
		.input(z.object({ id }))
		.query(({ ctx, input }) => {
			const row = automationOrThrow(ctx, input.id);
			return { id: row.id, prompt: row.prompt };
		}),
	setPrompt: protectedProcedure
		.input(z.object({ id, prompt: z.string().trim().min(1).max(100_000) }))
		.mutation(({ ctx, input }) => {
			automationOrThrow(ctx, input.id);
			ctx.db
				.update(localAutomations)
				.set({ prompt: input.prompt, updatedAt: Date.now() })
				.where(eq(localAutomations.id, input.id))
				.run();
			recordPromptVersion(ctx.db, input.id, input.prompt, "edit");
			return automationResult(automationOrThrow(ctx, input.id));
		}),
	runNow: protectedProcedure
		.input(z.object({ id }))
		.mutation(async ({ ctx, input }) => {
			const row = automationOrThrow(ctx, input.id);
			const result = await dispatchLocalAutomation(ctx, row);
			return { automationId: row.id, ...result };
		}),
	listRuns: protectedProcedure
		.input(
			z.object({
				automationId: id,
				limit: z.number().int().min(1).max(100).default(20),
			}),
		)
		.query(({ ctx, input }) => {
			automationOrThrow(ctx, input.automationId);
			return ctx.db
				.select()
				.from(localAutomationRuns)
				.where(eq(localAutomationRuns.automationId, input.automationId))
				.orderBy(desc(localAutomationRuns.createdAt))
				.limit(input.limit)
				.all()
				.map(runDto);
		}),
	validateRrule: protectedProcedure
		.input(
			z.object({
				rrule: z.string().min(1).max(500),
				timezone,
				dtstart: z.coerce.date().optional(),
			}),
		)
		.mutation(({ input }) => {
			const dtstart = input.dtstart ?? new Date();
			const parsed = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});
			return {
				rrule: input.rrule,
				timezone: input.timezone,
				dtstart,
				scheduleText: scheduleText(input.rrule),
				nextRunAt: parsed.nextRunAt,
				nextRuns: nextOccurrences({
					rrule: input.rrule,
					dtstart,
					timezone: input.timezone,
					count: 5,
				}),
			};
		}),
	versions: router({
		list: protectedProcedure
			.input(
				z.object({
					automationId: id,
					limit: z.number().int().min(1).max(200).default(100),
				}),
			)
			.query(({ ctx, input }) => {
				automationOrThrow(ctx, input.automationId);
				return ctx.db
					.select({
						id: localAutomationPromptVersions.id,
						automationId: localAutomationPromptVersions.automationId,
						contentHash: localAutomationPromptVersions.contentHash,
						source: localAutomationPromptVersions.source,
						restoredFromVersionId:
							localAutomationPromptVersions.restoredFromVersionId,
						createdAt: localAutomationPromptVersions.createdAt,
					})
					.from(localAutomationPromptVersions)
					.where(
						eq(localAutomationPromptVersions.automationId, input.automationId),
					)
					.orderBy(desc(localAutomationPromptVersions.createdAt))
					.limit(input.limit)
					.all()
					.map((row) => ({
						...row,
						createdAt: new Date(row.createdAt),
						updatedAt: new Date(row.createdAt),
						authorName: "This device",
						authorImage: null,
					}));
			}),
		getContent: protectedProcedure
			.input(z.object({ versionId: id }))
			.query(({ ctx, input }) => {
				const row = ctx.db
					.select()
					.from(localAutomationPromptVersions)
					.where(eq(localAutomationPromptVersions.id, input.versionId))
					.get();
				if (!row)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Version not found",
					});
				return {
					id: row.id,
					automationId: row.automationId,
					content: row.content,
				};
			}),
		restore: protectedProcedure
			.input(z.object({ versionId: id }))
			.mutation(({ ctx, input }) => {
				const version = ctx.db
					.select()
					.from(localAutomationPromptVersions)
					.where(eq(localAutomationPromptVersions.id, input.versionId))
					.get();
				if (!version)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Version not found",
					});
				ctx.db
					.update(localAutomations)
					.set({ prompt: version.content, updatedAt: Date.now() })
					.where(eq(localAutomations.id, version.automationId))
					.run();
				const newId = recordPromptVersion(
					ctx.db,
					version.automationId,
					version.content,
					"restore",
					version.id,
				);
				return { id: newId, automationId: version.automationId };
			}),
	}),
});
