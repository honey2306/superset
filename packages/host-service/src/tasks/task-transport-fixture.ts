/** Isolated full Host/daemon/Pi transport harness. Only model inference and
 * unrelated credential/GitHub providers are replaced, never the task driver. */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import type { AddressInfo, Socket } from "node:net";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { createApp } from "../app";
import {
	ACP_DAEMON_BUILD_VERSION,
	AcpDaemonClient,
} from "../runtime/acp-sessions/daemon";
import type { AppRouter } from "../trpc/router";
import { taskFixture } from "./test-fixture";

const buildDir = resolve(
	import.meta.dir,
	`../../.cache/task-transport-${process.pid}-${crypto.randomUUID().slice(0, 6)}`,
);
let buildPromise: Promise<string> | undefined;
async function buildTaskTransport(): Promise<string> {
	buildPromise ??= (async () => {
		mkdirSync(buildDir, { recursive: true });
		const entries: [string, string][] = [
			["runtime/acp-sessions/daemon-entry.ts", "acp-daemon.js"],
			["runtime/acp-sessions/pi-sdk-acp.ts", "pi-acp.js"],
			["runtime/acp-sessions/superset-mcp.ts", "superset-mcp.js"],
			[
				"runtime/acp-sessions/pi-acp-mcp-extension.ts",
				"pi-acp-mcp-extension.js",
			],
		];
		for (const [source, name] of entries) {
			const result = await Bun.build({
				entrypoints: [resolve(import.meta.dir, "..", source)],
				target: "bun",
				format: "esm",
				outdir: buildDir,
				naming: name,
				external: [
					"@agentclientprotocol/sdk",
					"@superset/session-protocol",
					"@earendil-works/pi-coding-agent",
					"@earendil-works/pi-ai",
					"@earendil-works/pi-agent-core",
				],
				plugins: [
					{
						name: "isolated-bun-db",
						setup(build) {
							build.onResolve({ filter: /^\.\.\/\.\.\/db$/ }, () => ({
								path: resolve(
									import.meta.dir,
									"../../test/fixtures/bun-host-db.ts",
								),
							}));
						},
					},
				],
			});
			if (!result.success)
				throw new Error(
					`${source}: ${result.logs.map((log) => log.message).join("\n")}`,
				);
		}

		return buildDir;
	})();
	return buildPromise;
}
// Keep bundles stable for all fixtures in this process. Repeated Bun builds
// followed by unlinking the same module graph are not needed for test isolation.
process.once("exit", () => rmSync(buildDir, { recursive: true, force: true }));

export async function createTaskTransportFixture(
	options: {
		allowedOrigins?: string[];
		conversationMode?: boolean;
		stopFirstTaskTurn?: boolean;
		delayMs?: number;
		realModel?: {
			provider: string;
			modelId: string;
			providerConfig: Record<string, unknown>;
		};
	} = {},
) {
	const buildDir = await buildTaskTransport();
	const f = await taskFixture();
	f.runner.requestStop(f.runId, "cancelled");
	await f.runner.tick();
	await f.runner.dispose();
	f.store.removeTask(f.taskId);
	const agentDir = join(f.directory, "pi"),
		isolatedHome = join(f.directory, "home");
	mkdirSync(agentDir, { mode: 0o700 });
	mkdirSync(isolatedHome, { mode: 0o700 });
	const socketPath = join(f.directory, "a.sock"),
		logPath = join(f.directory, "daemon.log");
	const NativeResponse = globalThis.Response;
	let modelRequests = 0,
		delayMs = options.delayMs ?? 0;
	const modelInputs: Array<{
		runId: string;
		iteration: number;
		revision: number;
		tools: string[];
		conversationContextSeen?: boolean;
	}> = [];
	const modelServer = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			if (new URL(request.url).pathname !== "/v1/chat/completions")
				return new NativeResponse("Not found", { status: 404 });
			const body = (await request.json()) as {
				messages: Array<{ role: string; content?: unknown }>;
				tools?: Array<{ function: { name: string } }>;
			};
			if (++modelRequests > 60)
				return NativeResponse.json(
					{ error: { message: "Local test model budget exhausted" } },
					{ status: 429 },
				);
			let lastUser = -1;
			body.messages.forEach((message, index) => {
				if (message.role === "user") lastUser = index;
			});
			const allText = JSON.stringify(body.messages);
			const ids = [
				...allText.matchAll(/(?:Run |Superset task )([a-f0-9-]{36})/g),
			];
			const runId = ids.at(-1)?.[1];
			if (
				options.conversationMode &&
				(!runId || f.store.getRun(runId).sessionReleasedAt)
			) {
				const text = allText.includes("CONTEXT_KEEP_42")
					? "Prior discussion retained: CONTEXT_KEEP_42. The approach is to change only value.txt and verify it."
					: "Ordinary conversation response.";
				const base = {
					id: `chat-${modelRequests}`,
					object: "chat.completion.chunk",
					created: Math.floor(Date.now() / 1000),
					model: "task-model",
				};
				return new NativeResponse(
					`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
					{ headers: { "Content-Type": "text/event-stream" } },
				);
			}
			if (!runId)
				return NativeResponse.json(
					{ error: { message: "Missing Task Run id in prompt" } },
					{ status: 400 },
				);
			const run = f.store.getRun(runId);
			const tools = (body.tools ?? []).map((tool) => tool.function.name);
			modelInputs.push({
				runId,
				iteration: run.iteration,
				revision: run.revision,
				tools,
				conversationContextSeen: allText.includes("CONTEXT_KEEP_42"),
			});
			const count = body.messages
				.slice(lastUser + 1)
				.filter((message) => message.role === "tool").length;
			const premature = Boolean(
				options.stopFirstTaskTurn && run.iteration === 0,
			);
			const chosen = premature
				? null
				: count === 0
					? {
							name: "write",
							arguments: JSON.stringify({
								path: "value.txt",
								content: run.iteration === 0 ? "wrong-on-purpose\n" : "right\n",
							}),
						}
					: count === 1
						? {
								name: "report_task_result",
								arguments: JSON.stringify({
									runId,
									iteration: run.iteration,
									revision: run.revision,
									outcome: "ready",
									summary: "Candidate emitted through real MCP and daemon",
									criteria: f.store.requirements(run.id).map((item) => ({
										id: item.id,
										status: "satisfied",
										evidence:
											"Deterministic fixture checks the requested value",
										checkIds: [
											...run.contract.checks.map((_, i) => `task:${i}`),
											...(run.profile?.config.checks.map(
												(check) => `project:${check.id}`,
											) ?? []),
										],
									})),
								}),
							}
						: null;
			if (chosen && !tools.includes(chosen.name))
				return NativeResponse.json(
					{
						error: {
							message: `Required tool ${chosen.name} is not registered`,
						},
					},
					{ status: 400 },
				);
			if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
			const base = {
				id: `transport-${modelRequests}`,
				object: "chat.completion.chunk",
				created: Math.floor(Date.now() / 1000),
				model: "task-model",
			};
			const delta = chosen
				? {
						role: "assistant",
						tool_calls: [
							{
								index: 0,
								id: `call-${modelRequests}`,
								type: "function",
								function: chosen,
							},
						],
					}
				: {
						role: "assistant",
						content: premature
							? "I have a plan but have not yet implemented the goal."
							: "Candidate reported.",
					};
			return new NativeResponse(
				`${[
					{ ...base, choices: [{ index: 0, delta, finish_reason: null }] },
					{
						...base,
						choices: [
							{
								index: 0,
								delta: {},
								finish_reason: chosen ? "tool_calls" : "stop",
							},
						],
						usage: {
							prompt_tokens: 20,
							completion_tokens: 10,
							total_tokens: 30,
						},
					},
				]
					.map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
					.join("")}data: [DONE]\n\n`,
				{ headers: { "Content-Type": "text/event-stream" } },
			);
		},
	});
	const psk = "task-transport-isolated-secret";
	let daemon: AcpDaemonClient | undefined;
	let host: ReturnType<typeof createApp> | undefined;
	let http: ReturnType<typeof serve> | undefined;
	let daemonPid: number | undefined;
	const httpSockets = new Set<Socket>();
	const cleanup = async () => {
		const closingLog = (stage: string) => {
			if (options.conversationMode)
				console.log(`[task-fixture] cleanup ${stage}`);
		};
		closingLog("cancel-session");
		if (daemon) {
			try {
				const sessions = await daemon.list({ limit: 100 });
				for (const session of sessions.items ?? []) {
					try {
						await daemon.cancel({ sessionId: session.sessionId });
					} catch {}
				}
			} catch {}
		}
		closingLog("http-close");
		// Stop accepting requests/streams before disposing their backing runtimes.
		if (http) {
			const server = http;
			const closed = new Promise<void>((done) => server.close(() => done()));
			// Bun's node:http close callback can remain pending after upgraded
			// WebSockets are destroyed. Verify the listener and every owned socket
			// are actually closed instead of waiting indefinitely for that callback.
			for (const socket of httpSockets) socket.destroy();
			if ("closeAllConnections" in server) server.closeAllConnections();
			let timer: ReturnType<typeof setTimeout> | undefined;
			await Promise.race([
				closed,
				new Promise<void>((done) => {
					timer = setTimeout(done, 1000);
				}),
			]);
			if (timer) clearTimeout(timer);
			if (
				server.listening ||
				[...httpSockets].some((socket) => !socket.destroyed)
			)
				throw new Error("Isolated test HTTP listener/socket failed to stop");
		}
		closingLog("host-dispose");
		if (host) await host.dispose();
		closingLog("daemon-and-fixture");
		if (daemonPid) {
			try {
				process.kill(daemonPid, "SIGTERM");
			} catch {}
		}
		modelServer.stop(true);
		await f.close();
		closingLog("finished");
	};
	try {
		writeFileSync(
			join(agentDir, "models.json"),
			JSON.stringify({
				providers: {
					"task-local": {
						api: "openai-completions",
						baseUrl: `http://127.0.0.1:${modelServer.port}/v1`,
						apiKey: "local-only-not-a-secret",
						models: [
							{
								id: "task-model",
								name: "Task model",
								reasoning: false,
								input: ["text"],
								contextWindow: 128000,
								maxTokens: 4096,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
							},
						],
					},
				},
			}),
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				defaultProvider: "task-local",
				defaultModel: "task-model",
				defaultThinkingLevel: "off",
				compaction: { enabled: false },
				retry: { enabled: false },
			}),
		);
		if (options.realModel) {
			if (process.env.SUPERSET_TASK_REAL_MODEL !== "1")
				throw new Error("Real-model verification requires explicit opt-in");
			writeFileSync(
				join(agentDir, "models.json"),
				JSON.stringify({
					providers: {
						[options.realModel.provider]: options.realModel.providerConfig,
					},
				}),
				{ mode: 0o600 },
			);
			writeFileSync(
				join(agentDir, "settings.json"),
				JSON.stringify({
					defaultProvider: options.realModel.provider,
					defaultModel: options.realModel.modelId,
					defaultThinkingLevel: "medium",
					compaction: { enabled: false },
					retry: { enabled: false },
				}),
				{ mode: 0o600 },
			);
		}
		chmodSync(join(agentDir, "models.json"), 0o600);
		chmodSync(join(agentDir, "settings.json"), 0o600);
		const removedKeys = Object.keys(process.env).filter((key) =>
			/TOKEN|SECRET|API_KEY|AUTH|PROXY|CREDENTIAL/i.test(key),
		);
		const sanitized: NodeJS.ProcessEnv = Object.fromEntries(
			removedKeys.map((key) => [key, undefined]),
		);
		daemon = new AcpDaemonClient({
			organizationId: "task-transport",
			scriptPath: join(buildDir, "acp-daemon.js"),
			socketPath,
			execPath: process.execPath,
			expectedBuildVersion: ACP_DAEMON_BUILD_VERSION,
			spawnEnv: {
				...sanitized,
				HOME: isolatedHome,
				XDG_CONFIG_HOME: join(isolatedHome, "config"),
				XDG_CACHE_HOME: join(isolatedHome, "cache"),
				NODE_ENV: "test",
				BUN_ENV: "test",
				ORGANIZATION_ID: "task-transport",
				HOST_DB_PATH: join(f.directory, "test.db"),
				HOST_MIGRATIONS_FOLDER: resolve(import.meta.dir, "../../drizzle"),
				HOST_SERVICE_PORT: "1",
				HOST_SERVICE_SECRET: psk,
				SUPERSET_HOME_DIR: isolatedHome,
				SUPERSET_ACP_DAEMON_LOG_PATH: logPath,
				SUPERSET_PI_ACP_ADAPTER_ENTRY: join(buildDir, "pi-acp.js"),
				PI_CODING_AGENT_DIR: agentDir,
				PI_OFFLINE: "1",
				SUPERSET_PI_ACP_DISABLE_EXTENSIONS: "1",
				// Root-chat title generation is unrelated to this model fixture;
				// do not spawn a user's corporate CLI as a side effect of UI testing.
				SUPERSET_MFCLI_TITLE_COMMAND: "/usr/bin/false",
				SUPERSET_AGENT_BROWSER: "0",
			},
		});
		daemonPid = (await daemon.hello()).pid;
		host = createApp({
			config: {
				organizationId: "task-transport",
				dbPath: join(f.directory, "test.db"),
				migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
				allowedOrigins: options.allowedOrigins ?? [],
			},
			db: f.db,
			acpSessions: daemon,
			providers: {
				hostAuth: {
					validate(request: Request) {
						const token = request.headers
							.get("authorization")
							?.replace(/^Bearer /, "");
						return token === psk
							? { ok: true, kind: "psk" as const }
							: { ok: false, kind: null };
					},
					validateToken(token: string) {
						return token === psk
							? { ok: true, kind: "psk" as const }
							: { ok: false, kind: null };
					},
				},
				credentials: {
					getCredentials: async () => ({ env: {} }),
					getToken: async () => null,
				},
				modelResolver: {
					hasUsableRuntimeEnv: async () => true,
					prepareRuntimeEnv: async () => {},
				},
			},
			execGh: async () => {
				throw new Error("GitHub disabled in isolated task verification");
			},
		});
		http = serve({
			hostname: "127.0.0.1",
			port: 0,
			overrideGlobalObjects: false,
			fetch: host.app.fetch,
		});
		host.injectWebSocket(http);
		http.on("connection", (socket: Socket) => {
			httpSockets.add(socket);
			socket.once("close", () => httpSockets.delete(socket));
		});
		if (!http.listening)
			await new Promise<void>((done) => http?.once("listening", done));
		const hostUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
		const api = createTRPCClient<AppRouter>({
			links: [
				httpBatchLink({
					url: `${hostUrl}/trpc`,
					transformer: SuperJSON,
					headers: { authorization: `Bearer ${psk}` },
				}),
			],
		});
		return {
			hostUrl,
			api,
			daemon,
			projectId: f.projectId,
			workspaceId: f.workspaceId,
			cwd: f.cwd,
			directory: f.directory,
			psk,
			db: f.db,
			store: f.store,
			get modelRequests() {
				return modelRequests;
			},
			modelInputs,
			setDelay(value: number) {
				delayMs = value;
			},
			logs: () =>
				existsSync(logPath)
					? readFileSync(logPath, "utf8").slice(-18000)
					: "<no daemon log>",
			close: cleanup,
		};
	} catch (error) {
		const log = existsSync(logPath)
			? readFileSync(logPath, "utf8").slice(-18000)
			: "<no log>";
		await cleanup();
		throw new Error(
			`${error instanceof AggregateError ? error.errors.map(String).join("\n") : String(error)}\n${log}`,
		);
	}
}
