import { getAgentModelSupport } from "@superset/shared/agent-models";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import { getAcpHarnessForPreset } from "../agents/agents";
import {
	type DelegatedExecutionModel,
	getCachedDynamicDelegatedExecutionModels,
} from "./delegated-execution-models";
import {
	readDelegatedExecutionSettings,
	resolveDelegatedExecutionConfig,
} from "./delegated-execution-target";

export type { DelegatedExecutionSettings } from "./delegated-execution-target";
export {
	readDelegatedExecutionSettings,
	resolveDelegatedExecutionTarget,
} from "./delegated-execution-target";

const settingsInputSchema = z.object({
	enabled: z.boolean(),
	executorAgentConfigId: z.string().min(1).nullable(),
	executorModelId: z.string().min(1).nullable(),
});

type DynamicModelDiscovery = (
	presetId: string,
) => Promise<DelegatedExecutionModel[]>;

async function assertValidTarget(
	db: HostDb,
	input: z.infer<typeof settingsInputSchema>,
	discoverDynamicModels: DynamicModelDiscovery,
) {
	if (!input.enabled) return;
	if (!input.executorAgentConfigId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Delegated execution requires a host agent config.",
		});
	}
	const config = resolveDelegatedExecutionConfig(
		db,
		input.executorAgentConfigId,
	);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config '${input.executorAgentConfigId}'.`,
		});
	}
	if (!getAcpHarnessForPreset(config.presetId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Agent '${config.label}' does not support ACP delegated execution.`,
		});
	}
	const modelSupport = getAgentModelSupport(config.presetId);
	if (!input.executorModelId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Delegated execution requires a concrete model.",
		});
	}
	const supportedModels = modelSupport
		? modelSupport.models
		: await discoverDynamicModels(config.presetId);
	if (!supportedModels.some((model) => model.id === input.executorModelId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Agent '${config.label}' does not support model '${input.executorModelId}'.`,
		});
	}
}

export function createDelegatedExecutionRouter(
	discoverDynamicModels: DynamicModelDiscovery = getCachedDynamicDelegatedExecutionModels,
) {
	return router({
		get: protectedProcedure.query(({ ctx }) =>
			readDelegatedExecutionSettings(ctx.db),
		),

		models: protectedProcedure
			.input(z.object({ executorAgentConfigId: z.string().min(1) }))
			.query(async ({ ctx, input }) => {
				const config = resolveDelegatedExecutionConfig(
					ctx.db,
					input.executorAgentConfigId,
				);
				if (!config) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `No host agent config '${input.executorAgentConfigId}'.`,
					});
				}
				if (!getAcpHarnessForPreset(config.presetId)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Agent '${config.label}' does not support ACP delegated execution.`,
					});
				}
				const staticSupport = getAgentModelSupport(config.presetId);
				return {
					models: staticSupport
						? staticSupport.models
						: await discoverDynamicModels(config.presetId),
				};
			}),

		set: protectedProcedure
			.input(settingsInputSchema)
			.mutation(async ({ ctx, input }) => {
				await assertValidTarget(ctx.db, input, discoverDynamicModels);
				ctx.db
					.insert(hostSettings)
					.values({
						id: 1,
						delegatedExecutionEnabled: input.enabled,
						delegatedExecutionAgentConfigId: input.executorAgentConfigId,
						delegatedExecutionModelId: input.executorModelId,
					})
					.onConflictDoUpdate({
						target: hostSettings.id,
						set: {
							delegatedExecutionEnabled: input.enabled,
							delegatedExecutionAgentConfigId: input.executorAgentConfigId,
							delegatedExecutionModelId: input.executorModelId,
						},
					})
					.run();

				return readDelegatedExecutionSettings(ctx.db);
			}),
	});
}

export const delegatedExecutionRouter = createDelegatedExecutionRouter();
