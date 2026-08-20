import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import {
	createDelegatedExecutionRouter,
	resolveDelegatedExecutionTarget,
	resolveDelegationProfileTargets,
} from "./delegated-execution";
import {
	type DelegatedExecutionModel,
	parseMyFlickerModelList,
	parsePiModelList,
} from "./delegated-execution-models";

function createCaller(
	discoverModels: (
		presetId: string,
	) => Promise<DelegatedExecutionModel[]> = async () => [],
) {
	const sqlite = new Database(":memory:");
	// Schema-direct fixture keeps this router test focused on its Drizzle
	// contract; the production migration is generated separately.
	sqlite.exec(`
		CREATE TABLE host_settings (
			id integer PRIMARY KEY DEFAULT 1,
			worktree_base_dir text,
			branch_prefix_mode text,
			branch_prefix_custom text,
			delegated_execution_enabled integer NOT NULL DEFAULT 0,
			delegated_execution_agent_config_id text,
			delegated_execution_model_id text,
			delegation_profiles text
		);
		CREATE TABLE host_agent_configs (
			id text PRIMARY KEY,
			preset_id text NOT NULL,
			icon_id text,
			label text NOT NULL,
			command text NOT NULL,
			args_json text NOT NULL DEFAULT '[]',
			prompt_transport text NOT NULL,
			prompt_args_json text NOT NULL DEFAULT '[]',
			env_json text NOT NULL DEFAULT '{}',
			display_order integer NOT NULL,
			created_at integer NOT NULL,
			updated_at integer NOT NULL
		);
	`);
	const db = drizzle(sqlite, { schema });
	const caller = createDelegatedExecutionRouter(discoverModels).createCaller({
		db,
		isAuthenticated: true,
	} as unknown as HostServiceContext);
	return { caller, db };
}

describe("delegatedExecutionRouter", () => {
	it("defaults to disabled", async () => {
		const { caller } = createCaller();
		expect(await caller.get()).toEqual({
			enabled: false,
			executorAgentConfigId: null,
			executorModelId: null,
		});
	});

	it("persists the selected ACP executor and concrete model", async () => {
		const { caller, db } = createCaller();
		const codex = "codex-config";
		seedAgentConfig(db, codex, "codex");

		const saved = await caller.set({
			enabled: true,
			executorAgentConfigId: codex,
			executorModelId: "gpt-5.6-sol",
		});
		expect(saved).toEqual({
			enabled: true,
			executorAgentConfigId: codex,
			executorModelId: "gpt-5.6-sol",
		});
		expect(await caller.get()).toEqual(saved);
	});

	it("lists and persists discovered models for dynamic ACP executors", async () => {
		const { caller, db } = createCaller(async (presetId) =>
			presetId === "pi"
				? [
						{
							id: "openai-codex/gpt-5.6-sol",
							label: "openai-codex/gpt-5.6-sol",
						},
					]
				: [],
		);
		seedAgentConfig(db, "pi-config", "pi");

		expect(await caller.models({ executorAgentConfigId: "pi-config" })).toEqual(
			{
				models: [
					{ id: "openai-codex/gpt-5.6-sol", label: "openai-codex/gpt-5.6-sol" },
				],
			},
		);
		await expect(
			caller.set({
				enabled: true,
				executorAgentConfigId: "pi-config",
				executorModelId: "not-discovered",
			}),
		).rejects.toThrow("does not support model");
		expect(
			await caller.set({
				enabled: true,
				executorAgentConfigId: "pi-config",
				executorModelId: "openai-codex/gpt-5.6-sol",
			}),
		).toMatchObject({ executorModelId: "openai-codex/gpt-5.6-sol" });
	});

	it("accepts the bundled MyFlicker ACP preset without a config row", async () => {
		const { caller, db } = createCaller(async (presetId) =>
			presetId === "myflicker"
				? [{ id: "wanqing/auto", label: "wanqing/Auto" }]
				: [],
		);

		expect(await caller.models({ executorAgentConfigId: "myflicker" })).toEqual(
			{ models: [{ id: "wanqing/auto", label: "wanqing/Auto" }] },
		);
		expect(
			await caller.set({
				enabled: true,
				executorAgentConfigId: "myflicker",
				executorModelId: "wanqing/auto",
			}),
		).toMatchObject({
			enabled: true,
			executorAgentConfigId: "myflicker",
			executorModelId: "wanqing/auto",
		});
		expect(resolveDelegatedExecutionTarget(db as unknown as HostDb)).toEqual({
			enabled: true,
			valid: true,
			agent: "myflicker",
			model: "wanqing/auto",
		});
	});

	it("rejects an unknown, non-ACP, or incompatible executor target", async () => {
		const { caller, db } = createCaller();
		seedAgentConfig(db, "codex-config", "codex");
		seedAgentConfig(db, "gemini-config", "gemini");

		await expect(
			caller.set({
				enabled: true,
				executorAgentConfigId: "missing",
				executorModelId: "gpt-5.6-sol",
			}),
		).rejects.toThrow("No host agent config");
		await expect(
			caller.set({
				enabled: true,
				executorAgentConfigId: "gemini-config",
				executorModelId: "gemini-2.5-pro",
			}),
		).rejects.toThrow("does not support ACP");
		await expect(
			caller.set({
				enabled: true,
				executorAgentConfigId: "codex-config",
				executorModelId: "not-a-codex-model",
			}),
		).rejects.toThrow("does not support model");
		await expect(
			caller.models({ executorAgentConfigId: "missing" }),
		).rejects.toThrow("No host agent config");
		await expect(
			caller.models({ executorAgentConfigId: "gemini-config" }),
		).rejects.toThrow("does not support ACP");
	});

	it("derives only the direct profile from legacy settings", async () => {
		const { caller, db } = createCaller();
		seedAgentConfig(db, "codex-config", "codex");
		await caller.set({
			enabled: true,
			executorAgentConfigId: "codex-config",
			executorModelId: "gpt-5.6-sol",
		});

		const profiles = await caller.profiles();
		expect(profiles.persisted).toBe(false);
		expect(profiles.profiles).toHaveLength(3);
		expect(profiles.profiles[0]).toMatchObject({
			id: "direct-execution",
			enabled: true,
			executorAgentConfigId: "codex-config",
			executorModelId: "gpt-5.6-sol",
		});
		expect(
			profiles.profiles.slice(1).every((profile) => !profile.enabled),
		).toBe(true);
	});

	it("persists ordered profiles and resolves the selected executor", async () => {
		const { caller, db } = createCaller();
		seedAgentConfig(db, "codex-config", "codex");
		const saved = await caller.setProfiles([
			{
				id: "design",
				name: "Design",
				description: "Architecture and investigation",
				instructions: "Write a short design before editing.",
				enabled: true,
				order: 4,
				executorAgentConfigId: "codex-config",
				executorModelId: "gpt-5.6-sol",
			},
			{
				id: "disabled",
				name: "Disabled",
				description: "Not currently available",
				instructions: null,
				enabled: false,
				order: 1,
				executorAgentConfigId: null,
				executorModelId: null,
			},
		]);
		expect(saved.persisted).toBe(true);
		expect(saved.profiles.map((profile) => profile.id)).toEqual([
			"design",
			"disabled",
		]);
		const targets = resolveDelegationProfileTargets(db as unknown as HostDb);
		expect(targets[0]).toMatchObject({
			id: "design",
			enabled: true,
			valid: true,
			agent: "codex",
			model: "gpt-5.6-sol",
		});
		expect(targets[1]).toMatchObject({ id: "disabled", enabled: false });
	});
});

describe("dynamic delegated execution model parsing", () => {
	it("parses Pi provider/model columns", () => {
		expect(
			parsePiModelList(
				"provider  model  context\nopenai-codex  gpt-5.6-sol  272K\n",
			),
		).toEqual([
			{ id: "openai-codex/gpt-5.6-sol", label: "openai-codex/gpt-5.6-sol" },
		]);
	});

	it("only returns MyFlicker models from authenticated providers", () => {
		const providers = JSON.stringify({
			success: true,
			data: {
				providers: [
					{ id: "wanqing", hasApiKey: true },
					{ id: "openai", hasApiKey: false },
				],
			},
		});
		const models = JSON.stringify({
			success: true,
			data: {
				groupedModels: [
					{
						providerId: "wanqing",
						models: [{ value: "wanqing/auto", name: "Auto" }],
					},
					{
						providerId: "openai",
						models: [{ value: "openai/gpt", name: "GPT" }],
					},
				],
			},
		});
		expect(parseMyFlickerModelList(providers, models)).toEqual([
			{ id: "wanqing/auto", label: "wanqing/Auto" },
		]);
	});

	it("recovers a complete groupedModels array when mfcli truncates currentModel", () => {
		const providers = JSON.stringify({
			success: true,
			data: { providers: [{ id: "wanqing", hasApiKey: true }] },
		});
		const models =
			'{"success":true,"data":{"groupedModels":[{"providerId":"wanqing","models":[{"value":"wanqing/auto","name":"Auto"}]}],"currentModel":{"huge":"';
		expect(parseMyFlickerModelList(providers, models)).toEqual([
			{ id: "wanqing/auto", label: "wanqing/Auto" },
		]);
	});

	it("does not recover a truncated groupedModels array", () => {
		const providers = JSON.stringify({
			success: true,
			data: { providers: [{ id: "wanqing", hasApiKey: true }] },
		});
		const models =
			'{"success":true,"data":{"groupedModels":[{"providerId":"wanqing","models":[{"value":"wanqing/auto"';
		expect(parseMyFlickerModelList(providers, models)).toEqual([]);
	});
});

function seedAgentConfig(
	db: ReturnType<typeof createCaller>["db"],
	id: string,
	presetId: string,
) {
	db.run(
		`INSERT INTO host_agent_configs (id, preset_id, label, command, args_json, prompt_transport, prompt_args_json, env_json, display_order, created_at, updated_at) VALUES ('${id}', '${presetId}', '${presetId}', '${presetId}', '[]', 'argv', '[]', '{}', 0, 1, 1)`,
	);
}
