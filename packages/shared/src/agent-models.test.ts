import { describe, expect, it } from "bun:test";
import {
	AGENT_EFFORT_SUPPORT,
	AGENT_MODEL_SUPPORT,
	buildAgentEffortArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
	getAgentEffortSupport,
	getAgentModelSupport,
	groupModelsByProvider,
	MODEL_PROVIDERS,
} from "./agent-models";
import { BUILTIN_TERMINAL_AGENT_TYPES } from "./builtin-terminal-agents";

describe("AGENT_MODEL_SUPPORT", () => {
	it("lists at least one model per entry", () => {
		for (const entry of AGENT_MODEL_SUPPORT) {
			expect(entry.models.length).toBeGreaterThan(0);
		}
	});

	it("tags every catalog model with a known provider", () => {
		for (const entry of AGENT_MODEL_SUPPORT) {
			for (const model of entry.models) {
				expect(
					model.provider,
					`${entry.presetId}/${model.id} is missing a provider`,
				).toBeDefined();
				expect(
					MODEL_PROVIDERS[model.provider as string],
					`${entry.presetId}/${model.id} uses an unknown provider`,
				).toBeDefined();
			}
		}
	});
});

describe("groupModelsByProvider", () => {
	it("returns [] for an empty list", () => {
		expect(groupModelsByProvider([])).toEqual([]);
	});

	it("keeps single-provider lists flat without a header", () => {
		const models = getAgentModelSupport("codex")?.models ?? [];
		expect(groupModelsByProvider(models)).toEqual([{ label: null, models }]);
	});

	it("keeps provider-less lists flat (efforts, dynamic models)", () => {
		const efforts = getAgentEffortSupport("claude")?.efforts ?? [];
		expect(groupModelsByProvider(efforts)).toEqual([
			{ label: null, models: efforts },
		]);
	});

	it("splits mixed lists into labelled groups in first-appearance order", () => {
		const groups = groupModelsByProvider(
			getAgentModelSupport("cursor-agent")?.models ?? [],
		);
		expect(groups.map((group) => group.label)).toEqual([
			"Cursor",
			"Anthropic",
			"OpenAI",
		]);
		expect(groups[0]?.models.map((model) => model.id)).toEqual([
			"auto",
			"composer-2.5",
		]);
		expect(groups[1]?.models.map((model) => model.id)).toEqual([
			"claude-fable-5-thinking-high",
			"claude-fable-5-thinking-xhigh",
			"claude-opus-5-high",
			"claude-opus-4-8-high",
			"claude-4.6-sonnet-medium",
		]);
		expect(groups[2]?.models.map((model) => model.id)).toEqual([
			"gpt-5.6-sol-medium",
			"gpt-5.6-terra-medium",
			"gpt-5.6-luna-medium",
			"gpt-5.3-codex",
		]);
	});

	it("merges provider-less options into the lead group of mixed lists", () => {
		const groups = groupModelsByProvider([
			{ id: "m1", label: "M1" },
			{ id: "a1", label: "A1", provider: "anthropic" },
			{ id: "m2", label: "M2" },
			{ id: "o1", label: "O1", provider: "openai" },
		]);
		expect(groups).toEqual([
			{
				label: null,
				models: [
					{ id: "m1", label: "M1" },
					{ id: "m2", label: "M2" },
				],
			},
			{
				label: "Anthropic",
				models: [{ id: "a1", label: "A1", provider: "anthropic" }],
			},
			{
				label: "OpenAI",
				models: [{ id: "o1", label: "O1", provider: "openai" }],
			},
		]);
	});

	it("falls back to the raw provider key for unknown providers", () => {
		const groups = groupModelsByProvider([
			{ id: "x", label: "X", provider: "newcorp" },
		]);
		expect(groups).toEqual([
			{ label: null, models: [{ id: "x", label: "X", provider: "newcorp" }] },
		]);
		const mixed = groupModelsByProvider([
			{ id: "x", label: "X", provider: "newcorp" },
			{ id: "y", label: "Y", provider: "anthropic" },
		]);
		expect(mixed.map((group) => group.label)).toEqual(["newcorp", "Anthropic"]);
	});
});

describe("getAgentModelSupport", () => {
	it("returns the entry for a supported preset", () => {
		expect(getAgentModelSupport("claude")?.modelFlag).toBe("--model");
	});

	it("returns undefined for presets without model support", () => {
		expect(getAgentModelSupport("amp")).toBeUndefined();
		expect(getAgentModelSupport("nonexistent")).toBeUndefined();
	});
});

describe("buildAgentModelArgs", () => {
	it("builds flag + value tokens", () => {
		expect(buildAgentModelArgs("claude", "sonnet")).toEqual([
			"--model",
			"sonnet",
		]);
	});

	it("returns [] when no model is set", () => {
		expect(buildAgentModelArgs("claude", undefined)).toEqual([]);
		expect(buildAgentModelArgs("claude", "")).toEqual([]);
	});

	it("returns [] for unsupported presets", () => {
		expect(buildAgentModelArgs("amp", "sonnet")).toEqual([]);
	});

	it("returns [] for model ids outside the preset's curated list", () => {
		expect(buildAgentModelArgs("claude", "bad-model")).toEqual([]);
		expect(buildAgentModelArgs("codex", "sonnet")).toEqual([]);
	});

	it("includes fable in claude's curated list", () => {
		expect(buildAgentModelArgs("claude", "fable")).toEqual([
			"--model",
			"fable",
		]);
	});

	it("includes opus 5 in claude's curated list", () => {
		expect(buildAgentModelArgs("claude", "claude-opus-5")).toEqual([
			"--model",
			"claude-opus-5",
		]);
	});

	it("includes fable for the other CLIs that support it", () => {
		expect(buildAgentModelArgs("copilot", "claude-fable-5")).toEqual([
			"--model",
			"claude-fable-5",
		]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-fable-5-thinking-high"),
		).toEqual(["--model", "claude-fable-5-thinking-high"]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-fable-5-thinking-xhigh"),
		).toEqual(["--model", "claude-fable-5-thinking-xhigh"]);
		expect(buildAgentModelArgs("opencode", "anthropic/claude-fable-5")).toEqual(
			["--model", "anthropic/claude-fable-5"],
		);
	});

	it("includes every GPT-5.6 Codex model", () => {
		for (const model of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
			expect(buildAgentModelArgs("codex", model)).toEqual(["--model", model]);
		}
	});

	it("includes opus 5 and the GPT-5.6 models for the other CLIs", () => {
		for (const model of [
			"claude-opus-5-high",
			"gpt-5.6-terra-medium",
			"gpt-5.6-luna-medium",
		]) {
			expect(buildAgentModelArgs("cursor-agent", model)).toEqual([
				"--model",
				model,
			]);
		}
		for (const model of [
			"anthropic/claude-opus-5",
			"openai/gpt-5.6-sol",
			"openai/gpt-5.6-terra",
			"openai/gpt-5.6-luna",
		]) {
			expect(buildAgentModelArgs("opencode", model)).toEqual([
				"--model",
				model,
			]);
		}
	});
});

describe("AGENT_EFFORT_SUPPORT", () => {
	it("only references builtin presets", () => {
		const validIds = new Set<string>(BUILTIN_TERMINAL_AGENT_TYPES);
		for (const entry of AGENT_EFFORT_SUPPORT) {
			expect(validIds.has(entry.presetId)).toBe(true);
		}
	});

	it("lists at least one effort per entry", () => {
		for (const entry of AGENT_EFFORT_SUPPORT) {
			expect(entry.efforts.length).toBeGreaterThan(0);
		}
	});
});

describe("getAgentEffortSupport", () => {
	it("returns the entry for a supported preset", () => {
		expect(getAgentEffortSupport("claude")?.effortFlag).toBe("--effort");
	});

	it("returns undefined for presets without effort support", () => {
		expect(getAgentEffortSupport("gemini")).toBeUndefined();
		expect(getAgentEffortSupport("superset")).toBeUndefined();
	});
});

describe("buildAgentEffortArgs", () => {
	it("builds flag + value tokens", () => {
		expect(buildAgentEffortArgs("claude", "high")).toEqual([
			"--effort",
			"high",
		]);
	});

	it("prefixes the value for codex config overrides", () => {
		expect(buildAgentEffortArgs("codex", "high")).toEqual([
			"-c",
			"model_reasoning_effort=high",
		]);
	});

	it("returns [] when no effort is set", () => {
		expect(buildAgentEffortArgs("claude", undefined)).toEqual([]);
		expect(buildAgentEffortArgs("claude", "")).toEqual([]);
	});

	it("returns [] for unsupported presets", () => {
		expect(buildAgentEffortArgs("gemini", "high")).toEqual([]);
	});

	it("returns [] for effort ids outside the preset's curated list", () => {
		expect(buildAgentEffortArgs("claude", "bogus")).toEqual([]);
		expect(buildAgentEffortArgs("copilot", "max")).toEqual([]);
	});
});

describe("buildAgentModelEnv (vibe)", () => {
	it("returns VIBE_ACTIVE_MODEL for a valid vibe model", () => {
		expect(buildAgentModelEnv("vibe", "mistral-medium-3.5")).toEqual({
			VIBE_ACTIVE_MODEL: "mistral-medium-3.5",
		});
	});
	it("returns {} for an unknown model id (degrade to Vibe default)", () => {
		expect(buildAgentModelEnv("vibe", "not-a-model")).toEqual({});
	});
	it("returns {} when no model is selected", () => {
		expect(buildAgentModelEnv("vibe", undefined)).toEqual({});
	});
	it("returns {} for a preset without modelEnv", () => {
		expect(buildAgentModelEnv("claude", "opus")).toEqual({});
	});
	it("keeps buildAgentModelArgs empty for vibe (no --model flag)", () => {
		expect(buildAgentModelArgs("vibe", "mistral-medium-3.5")).toEqual([]);
	});
	it("exposes a vibe model catalog", () => {
		expect(getAgentModelSupport("vibe")?.models.map((m) => m.id)).toEqual([
			"mistral-medium-3.5",
			"devstral-small",
		]);
	});
});
