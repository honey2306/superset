import { TRPCError } from "@trpc/server";
import { ProvisioningInputError } from "../../../workspace-provisioning";
import { protectedProcedure, router } from "../../index";
import {
	actInputSchema,
	getInputSchema,
	listInputSchema,
	provisionRequestSchema,
} from "./schemas";

/**
 * Public transport for the Workspace Provisioning Module. `begin`
 * synchronously drives one operation to a terminal state (M2 MVP — the
 * resume worker lives inside `begin`), `get` and `list` read the journal,
 * `act` dispatches retry/cancel.
 */
export const workspaceProvisioningRouter = router({
	begin: protectedProcedure
		.input(provisionRequestSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const { operation } = await ctx.runtime.workspaceProvisioning.begin(
					input,
					{ requestedByMachineId: ctx.clientMachineId },
				);
				return { operationId: operation.id, operation };
			} catch (err) {
				if (err instanceof ProvisioningInputError) {
					throw new TRPCError({
						code:
							err.code === "IDEMPOTENCY_CONFLICT" ? "CONFLICT" : "BAD_REQUEST",
						message: err.message,
					});
				}
				throw err;
			}
		}),
	get: protectedProcedure.input(getInputSchema).query(({ ctx, input }) => {
		const op = ctx.runtime.workspaceProvisioning.get(input.operationId);
		if (!op) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Operation ${input.operationId} not found`,
			});
		}
		return op;
	}),
	list: protectedProcedure.input(listInputSchema).query(({ ctx, input }) => {
		if (!ctx.clientMachineId) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message:
					"list requires x-superset-client-machine-id header (per-machine scoping)",
			});
		}
		return ctx.runtime.workspaceProvisioning.list({
			requestedByMachineId: ctx.clientMachineId,
			states: input.states,
		});
	}),
	act: protectedProcedure.input(actInputSchema).mutation(({ ctx, input }) => {
		try {
			return ctx.runtime.workspaceProvisioning.act({
				operationId: input.operationId,
				action: input.action,
			});
		} catch (err) {
			if (err instanceof ProvisioningInputError) {
				throw new TRPCError({
					code: err.code === "TOO_LATE_TO_CANCEL" ? "CONFLICT" : "BAD_REQUEST",
					message: err.message,
					cause: err,
				});
			}
			throw err;
		}
	}),
});
