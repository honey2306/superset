import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getSupervisor, waitForDaemonReady } from "../../../daemon";
import { terminalSessions, workspaces } from "../../../db/schema";
import {
	createTerminalSessionInternal,
	daemonSessionHasRunningProcess,
	disposeSessionAndWait,
	disposeSessionsByWorkspaceId,
	disposeSessionsByWorktreePath,
	listWorkspaceTerminalSessions,
	parseThemeType,
	sessionHasRunningProcess,
	writeInputToDaemonSession,
	writeInputToSession,
} from "../../../terminal/terminal";
import { transientTerminalManager } from "../../../terminal/transient-terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const createSessionInputSchema = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
	initialCommand: z.string().trim().min(1).optional(),
	cwd: z.string().optional(),
	themeType: z.string().optional(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
});

async function createTerminalSessionFromInput({
	ctx,
	input,
}: {
	ctx: HostServiceContext;
	input: z.infer<typeof createSessionInputSchema>;
}) {
	const terminalId = input.terminalId ?? crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		themeType: parseThemeType(input.themeType),
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: input.initialCommand,
		cwd: input.cwd,
		cols: input.cols,
		rows: input.rows,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	return {
		terminalId: result.terminalId,
		status: "active" as const,
	};
}

// Daemon control surface — sibling to the per-workspace terminal ops above.
// Org-scoped (one daemon per host-service); org id comes from request ctx
// rather than env so this module can be imported in tests where env vars
// aren't set.
// Supervisor lives in this same process so calls go through the in-process
// singleton, not over the wire.
const daemonRouter = router({
	getUpdateStatus: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getUpdateStatus(ctx.organizationId),
	),

	/**
	 * Whether the daemon is still answering, and for how long it hasn't.
	 * Deliberately does not `waitForDaemonReady` — this is polled by the
	 * terminal UI to decide whether a stall is worth surfacing, so it has to
	 * answer immediately rather than block on the thing that may be wedged.
	 */
	getHealth: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getHealth(ctx.organizationId),
	),

	listSessions: protectedProcedure.query(async ({ ctx }) => {
		// Wait for the bootstrap so the supervisor has a socket path.
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().listSessions(ctx.organizationId);
	}),

	listManagedSessions: protectedProcedure.query(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		const rawSessions =
			(await getSupervisor().listSessions(ctx.organizationId)) ?? [];
		const managedRows = ctx.db.query.terminalSessions.findMany().sync();
		const managedById = new Map(managedRows.map((row) => [row.id, row]));

		return {
			sessions: rawSessions.map((session) => {
				const managed = managedById.get(session.id);
				return {
					sessionId: session.id,
					workspaceId: managed?.originWorkspaceId ?? null,
					managed: managed !== undefined,
					status: managed?.status ?? null,
					pid: session.pid,
					cols: session.cols,
					rows: session.rows,
					isAlive: session.alive,
					createdAt: managed?.createdAt ?? null,
					lastAttachedAt: managed?.lastAttachedAt ?? null,
				};
			}),
		};
	}),

	killSession: protectedProcedure
		.input(z.object({ sessionId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			await waitForDaemonReady(ctx.organizationId);
			await getSupervisor().killSession(ctx.organizationId, input.sessionId);
			markDaemonSessionsDisposed(ctx, [input.sessionId]);
			return { sessionId: input.sessionId, status: "disposed" as const };
		}),

	killAllSessions: protectedProcedure.mutation(async ({ ctx }) =>
		killAllDaemonSessions(ctx),
	),

	/** Destructive full-quit path: kill every PTY, then stop the daemon. */
	stop: protectedProcedure.mutation(async ({ ctx }) => {
		const result = await killAllDaemonSessions(ctx);
		await getSupervisor().stop(ctx.organizationId);
		return result;
	}),

	clearReplayBuffers: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		const supervisor = getSupervisor();
		const sessions = (await supervisor.listSessions(ctx.organizationId)) ?? [];
		return supervisor.clearReplayBuffers(
			ctx.organizationId,
			sessions.map((session) => session.id),
		);
	}),

	restart: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().restart(ctx.organizationId);
	}),

	/**
	 * Phase 2: hand off live PTYs to a successor daemon binary.
	 *
	 * Sessions survive on success — the kernel master fds are inherited by
	 * the new daemon process via stdio. The renderer surfaces this as the
	 * "Update" path (vs `restart` which kills sessions). On failure, the
	 * UI offers force-restart as a fallback.
	 */
	update: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().update(ctx.organizationId);
	}),
});

async function killAllDaemonSessions(ctx: HostServiceContext): Promise<{
	killedCount: number;
	remainingCount: number;
}> {
	await waitForDaemonReady(ctx.organizationId);
	const supervisor = getSupervisor();
	const before = (await supervisor.listSessions(ctx.organizationId)) ?? [];
	const results = await Promise.allSettled(
		before.map((session) =>
			supervisor.killSession(ctx.organizationId, session.id),
		),
	);
	const killedIds = before
		.filter((_, index) => results[index]?.status === "fulfilled")
		.map((session) => session.id);
	markDaemonSessionsDisposed(ctx, killedIds);
	const remaining =
		(await supervisor.listSessions(ctx.organizationId))?.filter(
			(session) => session.alive,
		) ?? [];
	return {
		killedCount: killedIds.length,
		remainingCount: remaining.length,
	};
}

function markDaemonSessionsDisposed(
	ctx: HostServiceContext,
	sessionIds: string[],
): void {
	if (sessionIds.length === 0) return;
	const endedAt = Date.now();
	ctx.db
		.update(terminalSessions)
		.set({ status: "disposed", endedAt, disposeRequestedAt: endedAt })
		.where(inArray(terminalSessions.id, sessionIds))
		.run();
	for (const sessionId of sessionIds) {
		ctx.terminalAgentStore.markTerminalExited(sessionId);
	}
}

const transientCapabilitySchema = z.object({
	terminalId: z.string().startsWith("transient-"),
	attachmentToken: z.string().min(1),
});

const transientRouter = router({
	create: protectedProcedure
		.input(
			z.object({
				command: z.string().trim().min(1),
				cwd: z.string().optional(),
				cols: z.number().int().positive().optional(),
				rows: z.number().int().positive().optional(),
			}),
		)
		.mutation(async ({ input }) => transientTerminalManager.create(input)),

	write: protectedProcedure
		.input(transientCapabilitySchema.extend({ data: z.string() }))
		.mutation(({ input }) => {
			try {
				transientTerminalManager.write(
					input.terminalId,
					input.attachmentToken,
					input.data,
				);
			} catch (error) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: error instanceof Error ? error.message : "Access denied",
				});
			}
			return { success: true as const };
		}),

	resize: protectedProcedure
		.input(
			transientCapabilitySchema.extend({
				cols: z.number().int().positive(),
				rows: z.number().int().positive(),
			}),
		)
		.mutation(({ input }) => {
			try {
				transientTerminalManager.resize(
					input.terminalId,
					input.attachmentToken,
					input.cols,
					input.rows,
				);
			} catch (error) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: error instanceof Error ? error.message : "Access denied",
				});
			}
			return { success: true as const };
		}),

	kill: protectedProcedure
		.input(transientCapabilitySchema)
		.mutation(async ({ input }) => {
			try {
				await transientTerminalManager.kill(
					input.terminalId,
					input.attachmentToken,
				);
			} catch (error) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: error instanceof Error ? error.message : "Access denied",
				});
			}
			return { terminalId: input.terminalId, status: "disposed" as const };
		}),
});

export const terminalRouter = router({
	transient: transientRouter,

	createSession: protectedProcedure
		.input(createSessionInputSchema)
		.mutation(createTerminalSessionFromInput),

	launchSession: protectedProcedure
		.input(
			createSessionInputSchema.extend({
				initialCommand: z.string().trim().min(1),
			}),
		)
		.mutation(createTerminalSessionFromInput),

	listSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => ({
			sessions: await listWorkspaceTerminalSessions(ctx.db, input.workspaceId),
		})),

	countBackgroundSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				attachedTerminalIds: z.array(z.string()).default([]),
			}),
		)
		.query(async ({ ctx, input }) => {
			const sessions = await listWorkspaceTerminalSessions(
				ctx.db,
				input.workspaceId,
			);
			const attached = new Set(input.attachedTerminalIds);
			return {
				count: sessions.filter((session) => !attached.has(session.terminalId))
					.length,
			};
		}),

	hasRunningProcess: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const localRunning = sessionHasRunningProcess(
				input.terminalId,
				input.workspaceId,
			);
			if (localRunning) return { running: true };
			const row = ctx.db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
				.sync();
			if (
				!row ||
				row.originWorkspaceId !== input.workspaceId ||
				row.status !== "active"
			) {
				return { running: false };
			}
			return {
				running: await daemonSessionHasRunningProcess(input.terminalId),
			};
		}),

	writeInput: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				data: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			let result = writeInputToSession(input);
			if ("error" in result && result.error === "Terminal session not found") {
				const row = ctx.db.query.terminalSessions
					.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
					.sync();
				if (!row) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Terminal session not found",
					});
				}
				if (row.originWorkspaceId !== input.workspaceId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Terminal session does not belong to this workspace",
					});
				}
				result = await writeInputToDaemonSession(input.terminalId, input.data);
			}
			if ("error" in result) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: result.error,
				});
			}
			return { success: true as const };
		}),

	killSession: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const session = ctx.db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
				.sync();

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Terminal session not found",
				});
			}

			if (session.originWorkspaceId !== input.workspaceId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Terminal session does not belong to this workspace",
				});
			}

			await disposeSessionAndWait(input.terminalId, ctx.db);
			ctx.terminalAgentStore.markTerminalExited(input.terminalId);
			return { terminalId: input.terminalId, status: "disposed" as const };
		}),

	// Kill every session (including backgrounded, renderer-detached ones) for a
	// workspace. Called by delete paths that don't run the full
	// workspaceCleanup.destroy, so their terminals don't leak in the daemon.
	disposeWorkspaceSessions: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(({ ctx, input }) =>
			disposeSessionsByWorkspaceId(input.workspaceId, ctx.db),
		),

	// Like disposeWorkspaceSessions but for a closed worktree, which no longer
	// has a workspace id — resolve sessions through the shared worktree path.
	disposeWorktreeSessions: protectedProcedure
		.input(z.object({ worktreePath: z.string() }))
		.mutation(({ ctx, input }) =>
			disposeSessionsByWorktreePath(input.worktreePath, ctx.db),
		),

	daemon: daemonRouter,
});
