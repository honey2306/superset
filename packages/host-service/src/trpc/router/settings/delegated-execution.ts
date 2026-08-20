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
	readDelegationProfiles,
	resolveDelegatedExecutionConfig,
	serializeDelegationProfiles,
} from "./delegated-execution-target";

export type {
	DelegatedExecutionSettings,
	DelegationProfile,
	DelegationProfilesState,
} from "./delegated-execution-target";
export {
	readDelegatedExecutionSettings,
	readDelegationProfiles,
	resolveDelegatedExecutionTarget,
	resolveDelegationProfileTargets,
} from "./delegated-execution-target";

const settingsInputSchema = z.object({
	enabled: z.boolean(),
	executorAgentConfigId: z.string().min(1).nullable(),
	executorModelId: z.string().min(1).nullable(),
});

const profileInputSchema = z.object({
	id: z.string().trim().min(1).max(128),
	name: z.string().trim().min(1).max(200),
	description: z.string().trim().max(2_000),
	instructions: z.string().trim().max(20_000).nullable(),
	enabled: z.boolean(),
	order: z.number().int().min(0).max(1_000),
	executorAgentConfigId: z.string().trim().min(1).nullable(),
	executorModelId: z.string().trim().min(1).nullable(),
});

const profilesInputSchema = z
	.array(profileInputSchema)
	.max(50)
	.superRefine((profiles, context) => {
		const ids = new Set<string>();
		for (const [index, profile] of profiles.entries()) {
			if (ids.has(profile.id)) {
				context.addIssue({
					code: "custom",
					path: [index, "id"],
					message: "Profile ids must be unique.",
				});
			}
			ids.add(profile.id);
		}
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

		profiles: protectedProcedure.query(({ ctx }) =>
			readDelegationProfiles(ctx.db),
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

		setProfiles: protectedProcedure
			.input(profilesInputSchema)
			.mutation(async ({ ctx, input }) => {
				for (const profile of input) {
					await assertValidTarget(
						ctx.db,
						{
							enabled: profile.enabled,
							executorAgentConfigId: profile.executorAgentConfigId,
							executorModelId: profile.executorModelId,
						},
						discoverDynamicModels,
					);
				}
				const profiles = input.map((profile, order) => ({
					...profile,
					instructions: profile.instructions?.trim() || null,
					order,
				}));
				ctx.db
					.insert(hostSettings)
					.values({
						id: 1,
						delegationProfiles: serializeDelegationProfiles(profiles),
					})
					.onConflictDoUpdate({
						target: hostSettings.id,
						set: {
							delegationProfiles: serializeDelegationProfiles(profiles),
						},
					})
					.run();
				return readDelegationProfiles(ctx.db);
			}),
	});
}

export const delegatedExecutionRouter = createDelegatedExecutionRouter();
