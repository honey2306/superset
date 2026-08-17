import { getAgentModelSupport } from "@superset/shared/agent-models";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs, hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	getAcpHarnessForPreset,
	resolveBundledHostAgentConfig,
} from "../agents/agents";
import {
	type DelegatedExecutionModel,
	getCachedDynamicDelegatedExecutionModels,
} from "./delegated-execution-models";

export type DelegatedExecutionSettings = {
	enabled: boolean;
	executorAgentConfigId: string | null;
	executorModelId: string | null;
};

export function readDelegatedExecutionSettings(
	db: HostDb,
): DelegatedExecutionSettings {
	const row = db.select().from(hostSettings).get();
	return {
		enabled: row?.delegatedExecutionEnabled ?? false,
		executorAgentConfigId: row?.delegatedExecutionAgentConfigId ?? null,
		executorModelId: row?.delegatedExecutionModelId ?? null,
	};
}

interface DelegatedExecutionConfig {
	presetId: string;
	label: string;
}

/**
 * Pinned built-in agents do not necessarily have a host_agent_configs row.
 * Their preset id is a stable target id, so accept it after the database lookup
 * and still apply the ACP allow-list below.
 */
function resolveDelegatedExecutionConfig(
	db: HostDb,
	id: string,
): DelegatedExecutionConfig | null {
	const config = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.id, id))
		.get();
	if (config) return { presetId: config.presetId, label: config.label };
	const bundled = resolveBundledHostAgentConfig(id);
	return bundled ? { presetId: bundled.presetId, label: bundled.label } : null;
}

export function resolveDelegatedExecutionTarget(db: HostDb):
	| { enabled: false }
	| {
			enabled: true;
			valid: true;
			agent: "claude" | "codex" | "pi" | "myflicker";
			model: string | null;
	  }
	| {
			enabled: true;
			valid: false;
			error: string;
	  } {
	const settings = readDelegatedExecutionSettings(db);
	if (!settings.enabled || !settings.executorAgentConfigId) {
		return { enabled: false };
	}
	const config = resolveDelegatedExecutionConfig(
		db,
		settings.executorAgentConfigId,
	);
	if (!config) {
		return {
			enabled: true,
			valid: false,
			error: "The selected executor no longer exists.",
		};
	}
	if (!getAcpHarnessForPreset(config.presetId)) {
		return {
			enabled: true,
			valid: false,
			error: "The selected executor does not support ACP.",
		};
	}
	const modelSupport = getAgentModelSupport(config.presetId);
	if (!settings.executorModelId) {
		return {
			enabled: true,
			valid: false,
			error: "The selected executor requires a model.",
		};
	}
	if (
		modelSupport &&
		!modelSupport.models.some((model) => model.id === settings.executorModelId)
	) {
		return {
			enabled: true,
			valid: false,
			error: "The selected model is no longer available for this executor.",
		};
	}
	return {
		enabled: true,
		valid: true,
		agent: config.presetId as "claude" | "codex" | "pi" | "myflicker",
		model: settings.executorModelId,
	};
}

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
