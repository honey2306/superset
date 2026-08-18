import { ACP_AGENT_HARNESS_BY_AGENT_ID } from "@superset/shared/agent-catalog";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../db";
import { hostAgentConfigs, hostSettings } from "../../../db/schema";

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

export interface DelegatedExecutionConfig {
	presetId: string;
	label: string;
}

/** Pinned built-in agents have stable preset ids without a DB config row. */
export function resolveDelegatedExecutionConfig(
	db: HostDb,
	id: string,
): DelegatedExecutionConfig | null {
	const config = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.id, id))
		.get();
	if (config) return { presetId: config.presetId, label: config.label };
	const bundled = getPresetById(id);
	return bundled ? { presetId: bundled.presetId, label: bundled.label } : null;
}

function supportsAcpDelegatedExecution(presetId: string): boolean {
	return presetId in ACP_AGENT_HARNESS_BY_AGENT_ID;
}

export function resolveDelegatedExecutionTarget(db: HostDb):
	| { enabled: false }
	| {
			enabled: true;
			valid: true;
			agent: "claude" | "codex" | "pi" | "myflicker" | "deepseek";
			model: string | null;
	  }
	| { enabled: true; valid: false; error: string } {
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
	if (!supportsAcpDelegatedExecution(config.presetId)) {
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
		agent: config.presetId as
			| "claude"
			| "codex"
			| "pi"
			| "myflicker"
			| "deepseek",
		model: settings.executorModelId,
	};
}
