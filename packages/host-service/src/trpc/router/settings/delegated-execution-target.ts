import type {
	SupersetAgent,
	SupersetDelegationProfileSummary,
} from "@superset/session-protocol";
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

export interface DelegationProfile {
	id: string;
	name: string;
	description: string;
	instructions: string | null;
	enabled: boolean;
	order: number;
	executorAgentConfigId: string | null;
	executorModelId: string | null;
}

export interface DelegationProfileTarget extends DelegationProfile {
	valid: boolean;
	error?: string;
	agent?: SupersetAgent;
	model?: string | null;
}

export interface DelegationProfilesState {
	profiles: DelegationProfile[];
	persisted: boolean;
}

const DEFAULT_PROFILE_DEFINITIONS = [
	{
		id: "direct-execution",
		name: "Direct execution",
		description:
			"For ordinary implementation tasks that can be executed directly.",
		instructions: null,
	},
	{
		id: "design",
		name: "Design",
		description:
			"For architecture, investigation, planning, and design work before implementation.",
		instructions:
			"Focus on clarifying the design, trade-offs, affected files, and acceptance checks before making implementation changes.",
	},
	{
		id: "computer-use",
		name: "Computer Use",
		description:
			"For tasks that need browser or desktop interaction and visual verification.",
		instructions:
			"Use the available computer-use or browser interaction capabilities when the task requires operating a graphical interface, and report concrete observations.",
	},
] as const;

function defaultDelegationProfiles(
	settings: DelegatedExecutionSettings,
): DelegationProfile[] {
	return DEFAULT_PROFILE_DEFINITIONS.map((definition, order) => ({
		...definition,
		enabled: order === 0 ? settings.enabled : false,
		order,
		executorAgentConfigId: order === 0 ? settings.executorAgentConfigId : null,
		executorModelId: order === 0 ? settings.executorModelId : null,
	}));
}

function parseDelegationProfiles(
	value: string | null | undefined,
): DelegationProfile[] | null {
	if (typeof value !== "string") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;
	const profiles: DelegationProfile[] = [];
	const ids = new Set<string>();
	for (const [index, item] of parsed.entries()) {
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			return null;
		}
		const row = item as Record<string, unknown>;
		const id = typeof row.id === "string" ? row.id.trim() : "";
		const name = typeof row.name === "string" ? row.name.trim() : "";
		const description =
			typeof row.description === "string" ? row.description.trim() : "";
		const order =
			typeof row.order === "number" && Number.isSafeInteger(row.order)
				? row.order
				: index;
		const instructions =
			typeof row.instructions === "string" && row.instructions.trim()
				? row.instructions.trim()
				: null;
		const executorAgentConfigId =
			typeof row.executorAgentConfigId === "string" &&
			row.executorAgentConfigId.trim()
				? row.executorAgentConfigId.trim()
				: null;
		const executorModelId =
			typeof row.executorModelId === "string" && row.executorModelId.trim()
				? row.executorModelId.trim()
				: null;
		if (
			!id ||
			id.length > 128 ||
			ids.has(id) ||
			!name ||
			name.length > 200 ||
			description.length > 2_000 ||
			(instructions !== null && instructions.length > 20_000) ||
			typeof row.enabled !== "boolean"
		) {
			return null;
		}
		ids.add(id);
		profiles.push({
			id,
			name,
			description,
			instructions,
			enabled: row.enabled,
			order,
			executorAgentConfigId,
			executorModelId,
		});
	}
	return profiles
		.sort(
			(left, right) =>
				left.order - right.order || left.id.localeCompare(right.id),
		)
		.map((profile, order) => ({ ...profile, order }));
}

export function readDelegatedExecutionSettings(
	db: HostDb,
): DelegatedExecutionSettings {
	const row = db
		.select({
			enabled: hostSettings.delegatedExecutionEnabled,
			executorAgentConfigId: hostSettings.delegatedExecutionAgentConfigId,
			executorModelId: hostSettings.delegatedExecutionModelId,
		})
		.from(hostSettings)
		.get();
	return {
		enabled: row?.enabled ?? false,
		executorAgentConfigId: row?.executorAgentConfigId ?? null,
		executorModelId: row?.executorModelId ?? null,
	};
}

export function readDelegationProfiles(db: HostDb): DelegationProfilesState {
	const row = db
		.select({ delegationProfiles: hostSettings.delegationProfiles })
		.from(hostSettings)
		.get();
	const profiles = parseDelegationProfiles(row?.delegationProfiles);
	if (profiles !== null) return { profiles, persisted: true };
	return {
		profiles: defaultDelegationProfiles(readDelegatedExecutionSettings(db)),
		persisted: false,
	};
}

export function serializeDelegationProfiles(
	profiles: DelegationProfile[],
): string {
	return JSON.stringify(
		profiles.map((profile, order) => ({ ...profile, order })),
	);
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

type TargetResolution =
	| { enabled: false }
	| {
			enabled: true;
			valid: true;
			agent: SupersetAgent;
			model: string | null;
	  }
	| { enabled: true; valid: false; error: string };

function resolveTargetValues(
	db: HostDb,
	settings: DelegatedExecutionSettings,
): TargetResolution {
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
		// Claude's model ids are account/settings scoped. The async settings
		// mutations validate them against a fresh ACP session; this synchronous
		// resolver must not reapply the stale curated catalog.
		config.presetId !== "claude" &&
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
		agent: config.presetId as SupersetAgent,
		model: settings.executorModelId,
	};
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
	return resolveTargetValues(db, readDelegatedExecutionSettings(db));
}

export function resolveDelegationProfileTargets(
	db: HostDb,
): DelegationProfileTarget[] {
	return readDelegationProfiles(db).profiles.map((profile) => {
		const target = resolveTargetValues(db, {
			enabled: profile.enabled,
			executorAgentConfigId: profile.executorAgentConfigId,
			executorModelId: profile.executorModelId,
		});
		return target.enabled
			? { ...profile, ...target }
			: { ...profile, enabled: false, valid: false };
	});
}

export function toDelegationProfileSummary(
	profile: DelegationProfileTarget,
): SupersetDelegationProfileSummary {
	return {
		id: profile.id,
		name: profile.name,
		description: profile.description,
		enabled: profile.enabled,
		valid: profile.enabled && profile.valid,
		...(profile.enabled && profile.agent ? { agent: profile.agent } : {}),
		...(profile.enabled ? { model: profile.model ?? null } : {}),
	};
}
