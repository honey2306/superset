/**
 * Curated per-agent model and effort catalogs for the workspace-create
 * pickers.
 *
 * Entries are keyed by terminal-agent presetId (see
 * `builtin-terminal-agents.ts`).
 * Agents absent from this list don't support model selection and render no
 * picker. Model ids are the exact values the CLI accepts after `modelFlag`
 * (opencode requires `provider/model`, so the provider is baked into the id);
 *
 * The lists are hand-maintained and expected to drift with CLI releases —
 * update them here when a tool adds or retires models.
 */

export interface AgentModelOption {
	id: string;
	label: string;
	/**
	 * Provider that owns the model (models.dev logo key, e.g. "anthropic").
	 * Optional so effort lists and dynamically discovered models can reuse
	 * the option shape without pretending to have a provider.
	 */
	provider?: ModelProvider;
}

/**
 * Known model providers. The `(string & {})` escape keeps the union open
 * for future catalog entries while preserving editor autocompletion.
 */
export type ModelProvider =
	| "anthropic"
	| "openai"
	| "google"
	| "mistral"
	| "cursor"
	| (string & {});

/** Display names for picker group headers, keyed by models.dev provider id. */
export const MODEL_PROVIDERS: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	google: "Google",
	mistral: "Mistral",
	cursor: "Cursor",
	xai: "xAI",
	deepseek: "DeepSeek",
	moonshotai: "Moonshot",
	zhipuai: "Zhipu",
	alibaba: "Alibaba",
	minimax: "MiniMax",
};

/** Monochrome models.dev logo for a provider (safe with `dark:invert`). */
export function getProviderLogoUrl(provider: ModelProvider): string {
	return `https://models.dev/logos/${provider}.svg`;
}

/**
 * Case-insensitive models.dev logo key for a configured provider label —
 * exact match only, never fuzzy. Returns null for custom gateway names
 * ("万擎", "tokenverse") so callers fall back to their glyph.
 */
export function resolveModelProviderLogoKey(provider: string): string | null {
	if (MODEL_PROVIDERS[provider]) return provider;
	const lower = provider.toLowerCase();
	return MODEL_PROVIDERS[lower] ? lower : null;
}

export interface ModelOptionGroup {
	/** Group heading (e.g. "Anthropic"); null for the unlabelled lead group. */
	label: string | null;
	models: AgentModelOption[];
}

/**
 * Arrange options for picker rendering. Lists with at most one distinct
 * provider stay flat in a single unlabelled group (effort levels, single-
 * provider agents). Mixed lists split into provider-labelled groups in
 * first-appearance order; provider-less options collect into a leading
 * unlabelled group so dynamic catalogs keep their original order up top.
 */
export function groupModelsByProvider(
	models: readonly AgentModelOption[],
): ModelOptionGroup[] {
	const byKey = new Map<string, ModelOptionGroup>();
	const unlabelled: ModelOptionGroup = { label: null, models: [] };
	for (const model of models) {
		if (!model.provider) {
			unlabelled.models.push(model);
			continue;
		}
		const existing = byKey.get(model.provider);
		if (existing) existing.models.push(model);
		else {
			byKey.set(model.provider, {
				label: MODEL_PROVIDERS[model.provider] ?? model.provider,
				models: [model],
			});
		}
	}
	const labelled = [...byKey.values()];
	if (labelled.length <= 1) {
		const merged = [...unlabelled.models, ...labelled.flatMap((g) => g.models)];
		return merged.length ? [{ label: null, models: merged }] : [];
	}
	return unlabelled.models.length ? [unlabelled, ...labelled] : labelled;
}

export interface AgentModelSupport {
	presetId: string;
	modelFlag: string | null;
	/**
	 * Env var that carries the model when the CLI has no model flag (e.g. Vibe's
	 * `VIBE_ACTIVE_MODEL`). Mutually exclusive with `modelFlag` in practice.
	 */
	modelEnv?: string;
	models: AgentModelOption[];
}

export const AGENT_MODEL_SUPPORT: readonly AgentModelSupport[] = [
	{
		presetId: "claude",
		modelFlag: "--model",
		models: [
			{ id: "fable", label: "Fable", provider: "anthropic" },
			{ id: "opus", label: "Opus", provider: "anthropic" },
			{ id: "claude-opus-5", label: "Opus 5", provider: "anthropic" },
			{ id: "sonnet", label: "Sonnet", provider: "anthropic" },
			{ id: "haiku", label: "Haiku", provider: "anthropic" },
		],
	},
	{
		presetId: "codex",
		modelFlag: "--model",
		models: [
			{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "openai" },
			{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra", provider: "openai" },
			{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "openai" },
			{ id: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
			// Retiring from Codex on 2026-08-31; superseded by gpt-5.6-terra/luna.
			{ id: "gpt-5.4", label: "GPT-5.4", provider: "openai" },
			{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex", provider: "openai" },
		],
	},
	{
		presetId: "gemini",
		modelFlag: "--model",
		models: [
			{
				id: "gemini-2.5-pro",
				label: "Gemini 2.5 Pro",
				provider: "google",
			},
			{
				id: "gemini-2.5-flash",
				label: "Gemini 2.5 Flash",
				provider: "google",
			},
		],
	},
	{
		presetId: "copilot",
		modelFlag: "--model",
		models: [
			{
				id: "claude-fable-5",
				label: "Claude Fable 5",
				provider: "anthropic",
			},
			{
				id: "claude-sonnet-4.5",
				label: "Claude Sonnet 4.5",
				provider: "anthropic",
			},
			{ id: "gpt-5.1", label: "GPT-5.1", provider: "openai" },
		],
	},
	{
		presetId: "cursor-agent",
		modelFlag: "--model",
		models: [
			// cursor-agent has no effort flag, so effort/thinking levels are
			// baked into the model ids. Ids verified against a live account's
			// `--list-models` (2026-08-05); the list is account-dependent and
			// unknown ids are rejected by the CLI, not silently ignored.
			// "auto" is the only id free-plan accounts can use (besides
			// composer) — named models fail there with "Named models
			// unavailable", so keep an explicit working choice in the picker.
			{ id: "auto", label: "Auto", provider: "cursor" },
			{
				id: "claude-fable-5-thinking-high",
				label: "Fable 5",
				provider: "anthropic",
			},
			{
				id: "claude-fable-5-thinking-xhigh",
				label: "Fable 5 xHigh",
				provider: "anthropic",
			},
			{
				id: "claude-opus-5-high",
				label: "Opus 5",
				provider: "anthropic",
			},
			{
				id: "claude-opus-4-8-high",
				label: "Opus 4.8",
				provider: "anthropic",
			},
			{
				id: "claude-4.6-sonnet-medium",
				label: "Sonnet 4.6",
				provider: "anthropic",
			},
			{
				id: "gpt-5.6-sol-medium",
				label: "GPT-5.6 Sol",
				provider: "openai",
			},
			{
				id: "gpt-5.6-terra-medium",
				label: "GPT-5.6 Terra",
				provider: "openai",
			},
			{
				id: "gpt-5.6-luna-medium",
				label: "GPT-5.6 Luna",
				provider: "openai",
			},
			{
				id: "gpt-5.3-codex",
				label: "Codex 5.3",
				provider: "openai",
			},
			{
				id: "composer-2.5",
				label: "Composer 2.5",
				provider: "cursor",
			},
		],
	},
	{
		presetId: "opencode",
		modelFlag: "--model",
		models: [
			// openai ids verified against `opencode models` (2026-08-05), which
			// no longer lists the old `openai/gpt-5`. anthropic ids follow the
			// same models.dev catalog but need an authed anthropic provider to
			// appear in that listing.
			{
				id: "anthropic/claude-opus-5",
				label: "Claude Opus 5",
				provider: "anthropic",
			},
			{
				id: "anthropic/claude-fable-5",
				label: "Claude Fable 5",
				provider: "anthropic",
			},
			{
				id: "anthropic/claude-sonnet-4-5",
				label: "Claude Sonnet 4.5",
				provider: "anthropic",
			},
			{
				id: "openai/gpt-5.6-sol",
				label: "GPT-5.6 Sol",
				provider: "openai",
			},
			{
				id: "openai/gpt-5.6-terra",
				label: "GPT-5.6 Terra",
				provider: "openai",
			},
			{
				id: "openai/gpt-5.6-luna",
				label: "GPT-5.6 Luna",
				provider: "openai",
			},
		],
	},
	{
		presetId: "vibe",
		modelFlag: null,
		modelEnv: "VIBE_ACTIVE_MODEL",
		models: [
			{
				id: "mistral-medium-3.5",
				label: "Mistral Medium 3.5",
				provider: "mistral",
			},
			{
				id: "devstral-small",
				label: "Devstral Small",
				provider: "mistral",
			},
		],
	},
];

export interface AgentEffortSupport {
	presetId: string;
	effortFlag: string;
	/**
	 * Prepended to the selected effort id to form the flag's value token.
	 * Codex has no dedicated effort flag, so effort rides a config override:
	 * `-c model_reasoning_effort=high`.
	 */
	effortValuePrefix?: string;
	efforts: AgentModelOption[];
}

/**
 * Curated per-agent reasoning-effort catalogs, mirroring
 * `AGENT_MODEL_SUPPORT`. Flags and accepted values were verified against each
 * CLI's `--help` (or its own validator) — agents absent from this list
 * (gemini, opencode, cursor-agent, droid) expose no effort
 * control on their interactive launch command.
 */
export const AGENT_EFFORT_SUPPORT: readonly AgentEffortSupport[] = [
	{
		presetId: "claude",
		effortFlag: "--effort",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
			{ id: "max", label: "Max" },
		],
	},
	{
		presetId: "amp",
		effortFlag: "--effort",
		efforts: [
			{ id: "none", label: "None" },
			{ id: "minimal", label: "Minimal" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
			{ id: "max", label: "Max" },
		],
	},
	{
		presetId: "codex",
		effortFlag: "-c",
		effortValuePrefix: "model_reasoning_effort=",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
	{
		presetId: "mastracode",
		effortFlag: "--thinking-level",
		efforts: [
			{ id: "off", label: "Off" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
	{
		presetId: "pi",
		effortFlag: "--thinking",
		efforts: [
			{ id: "off", label: "Off" },
			{ id: "minimal", label: "Minimal" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
	{
		presetId: "copilot",
		effortFlag: "--effort",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
];

export function getAgentModelSupport(
	presetId: string,
): AgentModelSupport | undefined {
	return AGENT_MODEL_SUPPORT.find((entry) => entry.presetId === presetId);
}

export function getAgentEffortSupport(
	presetId: string,
): AgentEffortSupport | undefined {
	return AGENT_EFFORT_SUPPORT.find((entry) => entry.presetId === presetId);
}

/**
 * Argv tokens that select `effort` for the given preset, e.g.
 * `["--effort", "high"]` (codex: `["-c", "model_reasoning_effort=high"]`).
 * Same degrade-to-default contract as `buildAgentModelArgs`: unknown presets
 * or effort ids outside the curated list return `[]`.
 */
export function buildAgentEffortArgs(
	presetId: string,
	effort: string | undefined,
): string[] {
	if (!effort) return [];
	const support = getAgentEffortSupport(presetId);
	if (!support) return [];
	if (!support.efforts.some((option) => option.id === effort)) return [];
	return [support.effortFlag, `${support.effortValuePrefix ?? ""}${effort}`];
}

/**
 * Argv tokens that select `model` for the given preset, e.g.
 * `["--model", "sonnet"]`. Returns `[]` for unknown presets, presets without
 * a CLI flag (superset chat), an unset model, or a model id that isn't in
 * the preset's curated list — callers can spread the result unconditionally
 * and a stale or arbitrary model id degrades to the CLI default instead of
 * a broken launch.
 */
export function buildAgentModelArgs(
	presetId: string,
	model: string | undefined,
): string[] {
	if (!model) return [];
	const support = getAgentModelSupport(presetId);
	if (!support?.modelFlag) return [];
	if (!support.models.some((option) => option.id === model)) return [];
	return [support.modelFlag, model];
}

/**
 * Env vars that select `model` for env-based agents (Vibe has no `--model`
 * flag; the model rides `VIBE_ACTIVE_MODEL`). Same degrade-to-default contract
 * as `buildAgentModelArgs`: unknown presets, presets without `modelEnv`, an
 * unset model, or a model id outside the curated list return `{}`.
 */
export function buildAgentModelEnv(
	presetId: string,
	model: string | undefined,
): Record<string, string> {
	if (!model) return {};
	const support = getAgentModelSupport(presetId);
	if (!support?.modelEnv) return {};
	if (!support.models.some((option) => option.id === model)) return {};
	return { [support.modelEnv]: model };
}
