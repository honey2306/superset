import {
	cancelInput,
	clearQueueInput,
	closeSessionInput,
	createSessionInput,
	decodeMessagesCursor,
	editQueuedPromptInput,
	enqueuePromptInput,
	getMessagesInput,
	getSessionInput,
	getTranscriptInput,
	listDelegationRunsInput,
	listSessionsInput,
	promptInput,
	removeQueuedPromptInput,
	reorderQueueInput,
	respondToPermissionInput,
	sendNowInput,
	setConfigOptionInput,
	setModeInput,
	stopDelegationRunInput,
} from "@superset/session-protocol";
import { TRPCError } from "@trpc/server";
import { desc, eq, or } from "drizzle-orm";
import { delegationRuns } from "../../../db/schema";
import {
	AcpSessionDeadError,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
} from "../../../runtime/acp-sessions";
import { protectedProcedure, router } from "../../index";

/**
 * Every ACP procedure except `list` sits behind the host capability switch
 * (see HostServiceRuntime.acpSessionsEnabled) — a disabled host rejects the
 * surface with PRECONDITION_FAILED instead of exposing half-shipped behavior.
 * `list` stays ungated and answers `enabled: false` so clients can feature-
 * detect from the call they already make, without an extra request or error.
 */
const gatedProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (!ctx.runtime.acpSessionsEnabled) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "ACP sessions are disabled on this host",
		});
	}
	return next();
});

function rethrowMapped(error: unknown): never {
	if (error instanceof AcpSessionNotFoundError) {
		throw new TRPCError({ code: "NOT_FOUND", message: error.message });
	}
	if (error instanceof AcpSessionDeadError) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
		});
	}
	if (error instanceof AcpWorkspaceMismatchError) {
		throw new TRPCError({ code: "CONFLICT", message: error.message });
	}
	throw error;
}

/**
 * ACP session surface (docs/acp-sessions.md). Thin passthrough to
 * `ctx.runtime.acpSessions` — inputs come from `@superset/session-protocol`
 * so mobile and host validate against the same schemas. Fully parallel to the
 * mastra `chat` router, which stays untouched.
 */
export const acpSessionsRouter = router({
	list: protectedProcedure
		.input(listSessionsInput)
		.query(async ({ ctx, input }) => {
			if (!ctx.runtime.acpSessionsEnabled) {
				return { items: [], nextCursor: null, enabled: false };
			}
			return await ctx.runtime.acpSessions.list(input);
		}),

	/**
	 * Delegation activity is workspace-scoped rather than tab-scoped. Include
	 * both sides of the handoff so a child that outlives its parent tab remains
	 * visible in the workspace Info rail.
	 */
	listDelegationRuns: protectedProcedure
		.input(listDelegationRunsInput)
		.query(({ ctx, input }) =>
			ctx.db
				.select()
				.from(delegationRuns)
				.where(
					or(
						eq(delegationRuns.parentWorkspaceId, input.workspaceId),
						eq(delegationRuns.childWorkspaceId, input.workspaceId),
					),
				)
				.orderBy(desc(delegationRuns.createdAt))
				.limit(input.limit)
				.all(),
		),

	/** Stop an active delegated child while retaining its durable activity row. */
	stopDelegationRun: gatedProcedure
		.input(stopDelegationRunInput)
		.mutation(async ({ ctx, input }) => {
			const run = ctx.db
				.select()
				.from(delegationRuns)
				.where(eq(delegationRuns.id, input.runId))
				.get();
			if (!run) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Delegation run not found: ${input.runId}`,
				});
			}

			if (run.status === "creating" || run.status === "running") {
				try {
					await ctx.runtime.acpSessions.ensureLive(run.childSessionId);
					await ctx.runtime.acpSessions.cancel({
						sessionId: run.childSessionId,
					});
				} catch (error) {
					// The child may have already exited or been closed from another
					// surface. In that case the durable run still needs a terminal
					// status instead of remaining a forever-running orphan.
					if (
						!(
							error instanceof AcpSessionNotFoundError ||
							error instanceof AcpSessionDeadError
						)
					) {
						throw error;
					}
				}

				ctx.db
					.update(delegationRuns)
					.set({
						status: "cancelled",
						completedAt: null,
						failedAt: null,
						failureMessage: null,
						updatedAt: Date.now(),
					})
					.where(eq(delegationRuns.id, input.runId))
					.run();
			}

			return (
				ctx.db
					.select()
					.from(delegationRuns)
					.where(eq(delegationRuns.id, input.runId))
					.get() ?? run
			);
		}),

	create: gatedProcedure
		.input(createSessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.acpSessions.create(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	get: gatedProcedure.input(getSessionInput).query(async ({ ctx, input }) => {
		try {
			return await ctx.runtime.acpSessions.get(input.sessionId);
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	getMessages: gatedProcedure
		.input(getMessagesInput)
		.query(async ({ ctx, input }) => {
			let beforeSeq: number | undefined;
			if (input.cursor !== undefined) {
				const decoded = decodeMessagesCursor(input.cursor);
				if (decoded === null) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Invalid messages cursor: ${input.cursor}`,
					});
				}
				beforeSeq = decoded;
			}
			try {
				return await ctx.runtime.acpSessions.getMessages({
					sessionId: input.sessionId,
					beforeSeq,
					limit: input.limit,
				});
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	getTranscript: gatedProcedure
		.input(getTranscriptInput)
		.query(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.acpSessions.getTranscript(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	// Acks admission only — turn progress and completion ride the WS stream.
	// Never await the turn here: it can block on human permission decisions
	// far beyond the relay's buffered-HTTP timeout.
	prompt: gatedProcedure.input(promptInput).mutation(async ({ ctx, input }) => {
		try {
			await ctx.runtime.acpSessions.ensureLive(input.sessionId);
			const { accepted } = await ctx.runtime.acpSessions.prompt(input);
			return { accepted };
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	respondToPermission: gatedProcedure
		.input(respondToPermissionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				return await ctx.runtime.acpSessions.respondToPermission(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	cancel: gatedProcedure.input(cancelInput).mutation(async ({ ctx, input }) => {
		try {
			await ctx.runtime.acpSessions.ensureLive(input.sessionId);
			await ctx.runtime.acpSessions.cancel(input);
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	close: gatedProcedure
		.input(closeSessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.close(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	setMode: gatedProcedure
		.input(setModeInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				await ctx.runtime.acpSessions.setMode(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	setConfigOption: gatedProcedure
		.input(setConfigOptionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				await ctx.runtime.acpSessions.setConfigOption(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	enqueuePrompt: gatedProcedure
		.input(enqueuePromptInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				return ctx.runtime.acpSessions.enqueuePrompt(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	sendNow: gatedProcedure
		.input(sendNowInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				return await ctx.runtime.acpSessions.sendNow(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	removeQueuedPrompt: gatedProcedure
		.input(removeQueuedPromptInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				ctx.runtime.acpSessions.removeQueuedPrompt(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	reorderQueue: gatedProcedure
		.input(reorderQueueInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				ctx.runtime.acpSessions.reorderQueue(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	editQueuedPrompt: gatedProcedure
		.input(editQueuedPromptInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				ctx.runtime.acpSessions.editQueuedPrompt(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	clearQueue: gatedProcedure
		.input(clearQueueInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				ctx.runtime.acpSessions.clearQueue(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),
});
