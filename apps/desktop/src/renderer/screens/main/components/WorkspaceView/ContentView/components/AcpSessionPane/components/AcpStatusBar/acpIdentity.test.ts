import { describe, expect, test } from "bun:test";
import type {
	SessionConfigOption,
	SessionModeState,
} from "@superset/session-protocol";
import { normalizeAcpIdentity } from "./acpIdentity";

const thinkingModes: SessionModeState = {
	currentModeId: "thinking-medium",
	availableModes: [
		{ id: "thinking-low", name: "Thinking: low" },
		{ id: "thinking-medium", name: "Thinking: medium" },
		{ id: "thinking-high", name: "Thinking: high" },
	],
};

const permissionModes: SessionModeState = {
	currentModeId: "bypassPermissions",
	availableModes: [
		{ id: "default", name: "Default" },
		{ id: "bypassPermissions", name: "Bypass Permissions" },
	],
};

const options: SessionConfigOption[] = [
	{
		id: "mode",
		name: "Mode",
		category: "mode",
		type: "select",
		currentValue: "bypassPermissions",
		options: [{ value: "bypassPermissions", name: "Bypass Permissions" }],
	},
	{
		id: "model",
		name: "Model",
		category: "model",
		type: "select",
		currentValue: "gpt-5.6",
		options: [
			{
				value: "gpt-5.6",
				name: "openai-codex/GPT-5.6 Sol (recommended)",
			},
		],
	},
	{
		id: "effort",
		name: "Reasoning effort",
		category: "thought_level",
		type: "select",
		currentValue: "medium",
		options: [{ value: "medium", name: "Thinking: medium" }],
	},
];

describe("normalizeAcpIdentity", () => {
	test("returns one canonical Mode / Model / Thinking set", () => {
		const identity = normalizeAcpIdentity(permissionModes, options);

		expect(identity.mode?.label).toBe("Bypass Permissions");
		expect(identity.model?.label).toBe("GPT-5.6 Sol");
		expect(identity.thinking?.label).toBe("medium");
		expect(identity.thinking?.source).toBe("config");
	});

	test("moves a thinking-shaped ACP mode into the Thinking slot", () => {
		const identity = normalizeAcpIdentity(
			thinkingModes,
			options.filter((option) => option.id !== "mode"),
		);

		expect(identity.mode).toBeNull();
		expect(identity.thinking?.label).toBe("medium");
		expect(identity.thinking?.source).toBe("config");
	});

	test("uses a thinking-shaped mode when no config option exists", () => {
		const identity = normalizeAcpIdentity(thinkingModes, []);

		expect(identity.mode).toBeNull();
		expect(identity.thinking?.label).toBe("medium");
		expect(identity.thinking?.source).toBe("mode");
	});

	test("uses a config-only mode without inventing SessionModeState", () => {
		const identity = normalizeAcpIdentity(
			null,
			options.filter((option) => option.id === "mode"),
		);

		expect(identity.mode?.label).toBe("Bypass Permissions");
		expect(identity.mode?.source).toBe("config");
	});

	test("does not reclassify a mixed mode catalog from one selected label", () => {
		const identity = normalizeAcpIdentity(
			{
				currentModeId: "thinking",
				availableModes: [
					{ id: "default", name: "Default" },
					{ id: "thinking", name: "Thinking mode" },
				],
			},
			[],
		);

		expect(identity.mode?.label).toBe("Thinking mode");
		expect(identity.mode?.source).toBe("mode");
		expect(identity.thinking).toBeNull();
	});

	test("prefers the ACP thought_level category independent of option order", () => {
		const legacy: SessionConfigOption = {
			id: "reasoning_effort",
			name: "Reasoning",
			type: "select",
			currentValue: "high",
			options: [{ value: "high", name: "high" }],
		};
		const canonical: SessionConfigOption = {
			id: "custom-depth",
			name: "Depth",
			category: "thought_level",
			type: "select",
			currentValue: "low",
			options: [{ value: "low", name: "Reasoning: low" }],
		};

		for (const input of [
			[legacy, canonical],
			[canonical, legacy],
		]) {
			const identity = normalizeAcpIdentity(null, input);
			expect(identity.thinking?.label).toBe("low");
			expect(identity.thinking?.source).toBe("config");
		}
	});

	test("does not mistake other model configuration for model or thinking", () => {
		const identity = normalizeAcpIdentity(null, [
			{
				id: "fast",
				name: "Fast mode",
				category: "model_config",
				type: "select",
				currentValue: "on",
				options: [{ value: "on", name: "On" }],
			},
		]);

		expect(identity).toEqual({ mode: null, model: null, thinking: null });
	});
});
