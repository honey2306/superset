import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import type { SessionConfigOption } from "@superset/session-protocol";
import type { MyFlickerBackend } from "./myflicker-runtime";

export const MYFLICKER_MODEL_CONFIG_ID = "superset.myflicker.model";
export const MYFLICKER_SDK_DEFAULT_MODEL = "superset.sdk-default";
export class MyFlickerModelSelectionError extends Error {
	readonly outcomeUnknown = true;
}
export interface MyFlickerModel {
	id: string;
	name: string;
}
export interface MyFlickerModelContext {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	backend: MyFlickerBackend;
	signal?: AbortSignal;
}
export interface MyFlickerModelCompatibility {
	list(context: MyFlickerModelContext): Promise<MyFlickerModel[]>;
	select(
		context: MyFlickerModelContext & { sessionId: string; modelId: string },
	): Promise<void>;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function data(raw: string): Record<string, unknown> {
	const envelope = record(JSON.parse(raw));
	const result =
		envelope?.success === true
			? envelope.data === undefined
				? {}
				: record(envelope.data)
			: undefined;
	if (!result) throw new Error("mf returned an invalid model catalog");
	return result;
}

/** CLI output can contain credentials. Return only names/protocols; never log raw output/errors. */
function call(
	context: MyFlickerModelContext,
	handler: string,
	model?: string,
	sessionId?: string,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		execFile(
			context.command,
			[
				"call",
				handler,
				...(model ? ["--model", model] : []),
				...(sessionId ? ["--sessionId", sessionId] : []),
			],
			{
				cwd: context.cwd,
				env: context.env,
				signal: context.signal,
				timeout: 10_000,
				maxBuffer: 4_000_000,
			},
			(error, stdout) => {
				if (error) {
					reject(new Error(`mf model discovery failed: ${handler}`));
					return;
				}
				try {
					resolve(data(stdout));
				} catch {
					reject(new Error(`mf returned an invalid ${handler} response`));
				}
			},
		);
	});
}

export function configuredMyFlickerModels(
	providers: Record<string, unknown>,
	models: Record<string, unknown>,
): MyFlickerModel[] {
	const authenticated = new Set(
		(Array.isArray(providers.providers) ? providers.providers : []).flatMap(
			(p: unknown) => {
				const provider = record(p);
				return provider?.hasApiKey === true && typeof provider.id === "string"
					? [provider.id]
					: [];
			},
		),
	);
	const result = new Map<string, MyFlickerModel>();
	for (const rawGroup of Array.isArray(models.groupedModels)
		? models.groupedModels
		: []) {
		const group = record(rawGroup);
		if (
			!group ||
			!authenticated.has(String(group.providerId)) ||
			!Array.isArray(group.models)
		)
			continue;
		for (const raw of group.models) {
			const model = record(raw);
			if (typeof model?.value === "string" && typeof model.name === "string") {
				result.set(model.value, {
					id: model.value,
					name: `${group.providerId} / ${model.name}`,
				});
			}
		}
	}
	return [...result.values()];
}

export function myFlickerModelOption(
	models: MyFlickerModel[],
	selected?: string,
): SessionConfigOption {
	const currentValue = selected ?? MYFLICKER_SDK_DEFAULT_MODEL;
	return {
		id: MYFLICKER_MODEL_CONFIG_ID,
		category: "model",
		name: "Model",
		type: "select",
		currentValue,
		description:
			"Session-only SDK model selection. Reconnects the same native conversation without changing the global default.",
		options: [
			...(!selected
				? [
						{
							value: MYFLICKER_SDK_DEFAULT_MODEL,
							name: "SDK default (not reported)",
						},
					]
				: []),
			...(selected && !models.some((m) => m.id === selected)
				? [{ value: selected, name: `${selected} (saved)` }]
				: []),
			...models.map((model) => ({ value: model.id, name: model.name })),
		],
	};
}

export function withMyFlickerModel(
	options: SessionConfigOption[],
	model: SessionConfigOption | undefined,
): SessionConfigOption[] {
	const native = options.some(
		(o) =>
			o.id !== MYFLICKER_MODEL_CONFIG_ID &&
			(o.id === "model" || o.category === "model"),
	);
	const filtered = options.filter((o) => o.id !== MYFLICKER_MODEL_CONFIG_ID);
	return model && !native ? [...filtered, model] : filtered;
}

/** Scope caches to a manager; don't share provider credentials/configuration across hosts. */
export class MyFlickerModels implements MyFlickerModelCompatibility {
	private readonly cache = new Map<
		string,
		{ expires: number; result: Promise<MyFlickerModel[]> }
	>();
	list(context: MyFlickerModelContext): Promise<MyFlickerModel[]> {
		const key = JSON.stringify([context.command, context.cwd, context.backend]);
		const cached = this.cache.get(key);
		if (cached && cached.expires > Date.now()) return cached.result;
		const result = this.discover(context).catch((error) => {
			this.cache.delete(key);
			throw error;
		});
		this.cache.set(key, { expires: Date.now() + 60_000, result });
		return result;
	}
	private async discover(
		context: MyFlickerModelContext,
	): Promise<MyFlickerModel[]> {
		context = { ...context, signal: AbortSignal.timeout(30_000) };
		const [providers, models] = await Promise.all([
			call(context, "providers.list"),
			call(context, "models.list"),
		]);
		const candidates = configuredMyFlickerModels(providers, models);
		const compatible = new Set<string>();
		let index = 0;
		// mf's base registry omits protocol metadata in groupedModels. Resolve the
		// actual model metadata rather than guessing protocol from provider/model names.
		await Promise.all(
			Array.from({ length: Math.min(4, candidates.length) }, async () => {
				while (index < candidates.length) {
					context.signal?.throwIfAborted();
					const candidate = candidates[index++];
					if (!candidate) break;
					const state = await call(context, "models.list", candidate.id);
					const current = record(state.currentModel);
					const provider = record(current?.provider);
					const model = record(current?.model);
					if (`${provider?.id}/${model?.id}` !== candidate.id)
						throw new Error("mf did not resolve the requested model metadata");
					const format = model?.apiFormat ?? provider?.apiFormat;
					if (
						(context.backend === "codex" && format === "responses") ||
						(context.backend === "claude" && format === "anthropic")
					)
						compatible.add(candidate.id);
				}
			}),
		);
		return candidates.filter((model) => compatible.has(model.id));
	}
	async select(
		context: MyFlickerModelContext & { sessionId: string; modelId: string },
	): Promise<void> {
		try {
			await initializeMyFlickerSdkModel(context);
			// Claude's SDK init alone doesn't persist the override. Its next ACP
			// load reads the canonical SESSION model; never write config.set/global.
			await call(
				context,
				"session.setModel",
				context.modelId,
				context.sessionId,
			);
		} catch {
			throw new MyFlickerModelSelectionError(
				"mf could not confirm the SDK model change; reconnect this conversation before retrying",
			);
		}
	}
}

/**
 * mf 2.0.25's ACP config.set handler is missing for SDK backends. --model on
 * ACP resume also loses to a persisted Codex binding. SDK init has an explicit,
 * session-scoped override and updates that binding. No prompt/global config write.
 * The ACP owner MUST be stopped first; the SDK lease is released before returning.
 */
export async function initializeMyFlickerSdkModel(
	context: MyFlickerModelContext & { sessionId: string; modelId: string },
): Promise<void> {
	const child = spawn(
		context.command,
		["--backend", context.backend, "--approval-mode", "yolo", "sdk-server"],
		{ cwd: context.cwd, env: context.env, stdio: ["pipe", "pipe", "pipe"] },
	);
	const exited = once(child, "close").then(
		() => {},
		() => {},
	);
	child.stdin.on("error", () => {});
	let acknowledged = false;
	let failure: unknown;
	let cleanupFailure: Error | undefined;
	// Drain stderr, but never echo it: upstream diagnostics may include credentials.
	child.stderr.resume();
	try {
		await new Promise<void>((resolve, reject) => {
			let buffer = "";
			let sent = false;
			const timer = setTimeout(
				() => reject(new Error("mf SDK model selection timed out")),
				30_000,
			);
			const finish = (error?: Error) => {
				clearTimeout(timer);
				error ? reject(error) : resolve();
			};
			child.once("error", () =>
				finish(new Error("Could not start mf SDK model selection")),
			);
			child.once("exit", () =>
				finish(new Error("mf SDK exited before confirming the selected model")),
			);
			child.stdout.on("data", (chunk: Buffer) => {
				buffer += chunk.toString();
				if (buffer.length > 1_000_000) {
					finish(new Error("mf SDK response exceeded its size limit"));
					child.kill();
					return;
				}
				let end = buffer.indexOf("\n");
				while (end >= 0) {
					const line = buffer.slice(0, end);
					buffer = buffer.slice(end + 1);
					end = buffer.indexOf("\n");
					let message: Record<string, unknown> | undefined;
					try {
						message = record(JSON.parse(line));
					} catch {
						continue;
					}
					if (message?.method === "sdk::ready" && !sent) {
						sent = true;
						// Empty skills avoids mf 2.0.25 serializing skillRoots:undefined.
						child.stdin.write(
							`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session::init", params: { cwd: context.cwd, sessionId: context.sessionId, source: "resume", productName: "myflicker", configProductName: "myflicker", model: context.modelId, skills: [] } })}\n`,
						);
					} else if (message?.id === 1 && sent) {
						if (record(message.result)?.success === true && !message.error) {
							acknowledged = true;
							finish();
						} else
							finish(
								new Error(
									"mf SDK rejected the selected model; check its provider configuration",
								),
							);
					}
				}
			});
		});
	} catch (error) {
		failure = error;
	} finally {
		child.stdin.end();
		let timer: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			exited,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, 5_000);
			}),
		]);
		clearTimeout(timer);
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await exited;
			cleanupFailure = new Error(
				"mf SDK model selection did not release the native session; reopen the conversation",
			);
		}
		if (acknowledged && (child.exitCode !== 0 || child.signalCode !== null)) {
			cleanupFailure ??= new Error(
				"mf SDK failed while releasing the native model selection session",
			);
		}
	}
	if (failure) throw failure;
	if (cleanupFailure) throw cleanupFailure;
}
