import type { AgentIdentity } from "@superset/shared/agent-identity";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import { mapEventType } from "../../../events";
import { publicProcedure, router } from "../../index";

// Hook scripts emit "" for unset env vars; we coerce to undefined so the
// AgentIdentity broadcast carries only meaningful fields.
const agentIdentityInput = z
	.object({
		agentId: z.string().optional(),
		sessionId: z.string().optional(),
		definitionId: z.string().optional(),
	})
	.optional();

const hookInput = z.object({
	terminalId: z.string().min(1).optional(),
	eventType: z.string().min(1).optional(),
	eventId: z.string().min(16).max(128).optional(),
	occurredAt: z.number().int().nonnegative().optional(),
	capabilityToken: z.string().min(32).max(256).optional(),
	agent: agentIdentityInput,
});

function trimOrUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeAgentIdentity(
	agent: z.infer<typeof agentIdentityInput>,
): AgentIdentity | undefined {
	const agentId = trimOrUndefined(agent?.agentId);
	if (!agentId) return undefined;
	const sessionId = trimOrUndefined(agent?.sessionId);
	const definitionId = trimOrUndefined(agent?.definitionId);
	return {
		agentId: agentId as AgentIdentity["agentId"],
		...(sessionId ? { sessionId } : {}),
		...(definitionId
			? { definitionId: definitionId as AgentIdentity["definitionId"] }
			: {}),
	};
}

export const notificationsRouter = router({
	/**
	 * Agent lifecycle hook. Shells receive a terminal-scoped capability rather
	 * than the Host PSK. Stable event IDs make retries and the Electron fallback
	 * idempotent, while the bounded durable ledger prevents replay side effects.
	 */
	hook: publicProcedure.input(hookInput).mutation(async ({ ctx, input }) => {
		const authorization = ctx.runtime.notificationHooks.authorizeAndConsume({
			terminalId: input.terminalId ?? "",
			capabilityToken: input.capabilityToken ?? "",
			eventId: input.eventId ?? "",
			occurredAt: input.occurredAt ?? 0,
		});
		if (!authorization.ok) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: authorization.reason,
			});
		}
		if (authorization.duplicate) {
			return {
				success: true,
				ignored: false as const,
				duplicate: true as const,
			};
		}

		const eventType = mapEventType(input.eventType);
		if (!eventType || !input.terminalId) {
			return { success: true, ignored: true as const };
		}

		const terminalSession = ctx.db.query.terminalSessions
			.findFirst({
				where: eq(terminalSessions.id, input.terminalId),
				columns: { originWorkspaceId: true },
			})
			.sync();
		if (!terminalSession?.originWorkspaceId) {
			return { success: true, ignored: true as const };
		}

		const agent = normalizeAgentIdentity(input.agent);
		const eventId = input.eventId ?? "test-authorized-event";
		const occurredAt = input.occurredAt ?? Date.now();

		ctx.eventBus.broadcastAgentLifecycle({
			eventId,
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			terminalId: input.terminalId,
			...(agent ? { agent } : {}),
			occurredAt,
		});

		ctx.terminalAgentStore.recordEvent({
			terminalId: input.terminalId,
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			...(agent?.agentId ? { agentId: agent.agentId } : {}),
			...(agent?.sessionId ? { agentSessionId: agent.sessionId } : {}),
			...(agent?.definitionId ? { definitionId: agent.definitionId } : {}),
			occurredAt,
		});

		return { success: true, ignored: false as const };
	}),
});
