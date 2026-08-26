import { spawn } from "node:child_process";
import type { SessionConfigOption } from "@superset/session-protocol";

export interface DelegatedExecutionModel {
	id: string;
	label: string;
}

/**
 * Convert ACP's live `model` selector into the small catalog consumed by the
 * settings picker. ACP permits either a flat option list or grouped options;
 * preserve the adapter's value as the id because that is what
 * `session/set_config_option` accepts later.
 */
export function parseAcpModelOptions(
	configOptions: readonly SessionConfigOption[],
): DelegatedExecutionModel[] {
	const modelOption = configOptions.find(
		(option) =>
			option.type === "select" &&
			(option.id === "model" || option.category === "model"),
	);
	if (!modelOption || modelOption.type !== "select") return [];

	return uniqueModels(
		modelOption.options
			.flatMap((option) => ("options" in option ? option.options : [option]))
			.map((option) => ({ id: option.value, label: option.name })),
	);
}

const LIST_MODELS_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const CACHE_TTL_MS = 60_000;
const cache = new Map<
	string,
	{ expiresAt: number; result: Promise<DelegatedExecutionModel[]> }
>();

/**
 * Reads models from the ACP-backed CLIs. Commands and arguments are constants
 * (rather than agent-config values) so selecting an agent config cannot turn
 * this endpoint into a shell-execution primitive.
 */
export async function getDynamicDelegatedExecutionModels(
	presetId: string,
): Promise<DelegatedExecutionModel[]> {
	switch (presetId) {
		case "pi":
			return parsePiModelList(await runCommand("pi", ["--list-models"]));
		case "myflicker": {
			const [providers, models] = await Promise.all([
				runCommand("mfcli", ["call", "providers.list"]),
				runCommand("mfcli", ["call", "models.list"]),
			]);
			return parseMyFlickerModelList(providers, models);
		}
		default:
			return [];
	}
}

export function getCachedDynamicDelegatedExecutionModels(
	presetId: string,
): Promise<DelegatedExecutionModel[]> {
	const cached = cache.get(presetId);
	if (cached && cached.expiresAt > Date.now()) return cached.result;
	const result = getDynamicDelegatedExecutionModels(presetId).catch((error) => {
		cache.delete(presetId);
		throw error;
	});
	cache.set(presetId, { expiresAt: Date.now() + CACHE_TTL_MS, result });
	return result;
}

export function parsePiModelList(raw: string): DelegatedExecutionModel[] {
	const rows = raw
		.trim()
		.split(/\r?\n/)
		.slice(1)
		.map((line) => line.trim().split(/\s{2,}/))
		.filter((columns) => columns.length >= 2);
	return uniqueModels(
		rows.map(([provider, model]) => ({
			id: `${provider}/${model}`,
			label: `${provider}/${model}`,
		})),
	);
}

/** Parse the two mfcli envelopes and retain every provider authenticated in ACP. */
export function parseMyFlickerModelList(
	providersRaw: string,
	modelsRaw: string,
): DelegatedExecutionModel[] {
	const providers = getEnvelopeData(providersRaw);
	const models =
		getEnvelopeData(modelsRaw) ?? getTruncatedModelsData(modelsRaw);
	if (
		!isRecord(providers) ||
		!Array.isArray(providers.providers) ||
		!isRecord(models)
	) {
		return [];
	}
	const authenticatedProviderIds = new Set(
		providers.providers.flatMap((provider) =>
			isRecord(provider) &&
			typeof provider.id === "string" &&
			provider.hasApiKey === true
				? [provider.id]
				: [],
		),
	);
	const groupedModels = models.groupedModels;
	if (!Array.isArray(groupedModels)) return [];
	return uniqueModels(
		groupedModels.flatMap((group) => {
			if (
				!isRecord(group) ||
				typeof group.providerId !== "string" ||
				!authenticatedProviderIds.has(group.providerId) ||
				!Array.isArray(group.models)
			) {
				return [];
			}
			return group.models.flatMap((model) =>
				isRecord(model) &&
				typeof model.value === "string" &&
				typeof model.name === "string"
					? [{ id: model.value, label: `${group.providerId}/${model.name}` }]
					: [],
			);
		}),
	);
}

function getEnvelopeData(raw: string): unknown {
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecord(parsed) && parsed.success === true ? parsed.data : null;
	} catch {
		return null;
	}
}

/**
 * mfcli 0.3.15 can truncate stdout after its complete `groupedModels` array
 * while serialising the much larger `currentModel` object. Keep the normal
 * envelope parsing path strict; this fallback accepts only a complete array
 * belonging directly to the top-level `data` object.
 */
function getTruncatedModelsData(raw: string): unknown {
	const groupedModels = extractTopLevelDataGroupedModels(raw);
	return groupedModels ? { groupedModels } : null;
}

function extractTopLevelDataGroupedModels(raw: string): unknown[] | null {
	let depth = 0;
	let dataDepth: number | null = null;
	for (let index = 0; index < raw.length; index += 1) {
		const character = raw[index];
		if (character === '"') {
			const stringEnd = findJsonStringEnd(raw, index);
			if (stringEnd === null) return null;
			const key = parseJsonString(raw.slice(index, stringEnd + 1));
			const valueStart = skipWhitespaceAndColon(raw, stringEnd + 1);
			if (key === "data" && depth === 1 && raw[valueStart] === "{") {
				dataDepth = depth + 1;
			} else if (
				key === "groupedModels" &&
				dataDepth === depth &&
				raw[valueStart] === "["
			) {
				const array = extractCompleteJsonArray(raw, valueStart);
				if (!array) return null;
				try {
					const parsed: unknown = JSON.parse(array);
					return Array.isArray(parsed) ? parsed : null;
				} catch {
					return null;
				}
			}
			index = stringEnd;
			continue;
		}
		if (character === "{") depth += 1;
		else if (character === "}") {
			if (dataDepth === depth) dataDepth = null;
			depth -= 1;
		}
	}
	return null;
}

function findJsonStringEnd(raw: string, start: number): number | null {
	for (let index = start + 1; index < raw.length; index += 1) {
		if (raw[index] === "\\") {
			index += 1;
			continue;
		}
		if (raw[index] === '"') return index;
	}
	return null;
}

function parseJsonString(raw: string): string | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "string" ? parsed : null;
	} catch {
		return null;
	}
}

function skipWhitespaceAndColon(raw: string, start: number): number {
	let index = start;
	while (index < raw.length && /\s/.test(raw.charAt(index))) index += 1;
	if (raw[index] !== ":") return -1;
	index += 1;
	while (index < raw.length && /\s/.test(raw.charAt(index))) index += 1;
	return index;
}

function extractCompleteJsonArray(raw: string, start: number): string | null {
	let depth = 0;
	for (let index = start; index < raw.length; index += 1) {
		if (raw[index] === '"') {
			const stringEnd = findJsonStringEnd(raw, index);
			if (stringEnd === null) return null;
			index = stringEnd;
			continue;
		}
		if (raw[index] === "[") depth += 1;
		else if (raw[index] === "]") {
			depth -= 1;
			if (depth === 0) return raw.slice(start, index + 1);
		}
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function uniqueModels(models: DelegatedExecutionModel[]) {
	const seen = new Set<string>();
	return models.filter(({ id, label }) => {
		if (!id.trim() || !label.trim() || seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}

function runCommand(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (error) reject(error);
			else resolve(stdout);
		};
		const timeout = setTimeout(() => {
			child.kill("SIGTERM");
			finish(
				new Error(
					`Model discovery timed out after ${LIST_MODELS_TIMEOUT_MS}ms.`,
				),
			);
		}, LIST_MODELS_TIMEOUT_MS);
		const append = (target: "stdout" | "stderr", chunk: Buffer | string) => {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			if (target === "stdout") stdout += text;
			else stderr += text;
			if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
				child.kill("SIGTERM");
				finish(new Error("Model discovery returned too much output."));
			}
		};
		child.stdout?.on("data", (chunk: Buffer | string) =>
			append("stdout", chunk),
		);
		child.stderr?.on("data", (chunk: Buffer | string) =>
			append("stderr", chunk),
		);
		child.on("error", (error) => finish(error));
		child.on("close", (code) => {
			if (code === 0) finish();
			else
				finish(
					new Error(
						`${command} exited ${code}: ${stderr.trim() || "no stderr"}`,
					),
				);
		});
	});
}
