/** Actual installed Pi SDK + native write/custom tools + real Host verification.
 * Only the model endpoint is deterministic and loopback-only. No personal
 * credentials, model credits, live repositories or deployed services are used. */
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { taskCandidateSchema } from "@superset/shared/tasks";
import { createTaskRunner } from "./task-composition";
import type { TaskRun } from "./task-store";
import { eventually, FakeTaskDriver, taskFixture } from "./test-fixture";

test("real Pi SDK performs write → candidate → failed Host check → same-session repair → verified completion", async () => {
	const f = await taskFixture({
		checks: [
			{
				name: "value acceptance",
				command: 'test "$(cat value.txt)" = right',
				timeoutMs: 2_000,
			},
		],
		completion: "checks",
	});
	let requests = 0;
	const providerBodies: unknown[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			if (new URL(request.url).pathname !== "/v1/chat/completions")
				return new Response("Not found", { status: 404 });
			const body = (await request.json()) as {
				messages: Array<{ role: string; content?: unknown }>;
			};
			providerBodies.push(body);
			requests++;
			if (requests > 9)
				return Response.json(
					{ error: { message: "Test model request budget exceeded" } },
					{ status: 400 },
				);
			let latestUser = -1;
			body.messages.forEach((message, index) => {
				if (message.role === "user") latestUser = index;
			});
			const toolsSinceUser = body.messages
				.slice(latestUser + 1)
				.filter((message) => message.role === "tool").length;
			const run = f.run();
			const tool =
				toolsSinceUser === 0
					? {
							name: "write",
							arguments: JSON.stringify({
								path: "value.txt",
								content: run.iteration === 0 ? "still-wrong\n" : "right\n",
							}),
						}
					: toolsSinceUser === 1
						? {
								name: "report_task_result",
								arguments: JSON.stringify({
									runId: run.id,
									iteration: run.iteration,
									outcome: "ready",
									summary: "Candidate ready for the Host check",
									criteria: f.store.requirements(run.id).map((item) => ({
										id: item.id,
										status: "satisfied",
										evidence: "Native fixture checks value.txt",
										checkIds: ["task:0"],
									})),
								}),
							}
						: null;
			const base = {
				id: `chat-test-${requests}`,
				object: "chat.completion.chunk",
				created: Math.floor(Date.now() / 1000),
				model: "task-stub",
			};
			const delta = tool
				? {
						role: "assistant",
						tool_calls: [
							{
								index: 0,
								id: `tool-${requests}`,
								type: "function",
								function: tool,
							},
						],
					}
				: { role: "assistant", content: "Candidate reported." };
			const frames = [
				{ ...base, choices: [{ index: 0, delta, finish_reason: null }] },
				{
					...base,
					choices: [
						{
							index: 0,
							delta: {},
							finish_reason: tool ? "tool_calls" : "stop",
						},
					],
					usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
				},
			];
			return new Response(
				frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") +
					"data: [DONE]\n\n",
				{ headers: { "Content-Type": "text/event-stream" } },
			);
		},
	});
	let session: AgentSession | undefined;
	let activePrompt: Promise<void> | undefined;
	const nativeEvents: string[] = [];
	const settings = SettingsManager.inMemory({
		compaction: { enabled: false },
		retry: { enabled: false },
	});
	const agentDir = join(f.directory, "isolated-pi");
	mkdirSync(agentDir);
	const models = await ModelRuntime.create({
		credentials: {
			read: async () => undefined,
			list: async () => [],
			modify: async () => undefined,
			delete: async () => {},
		},
		modelsPath: null,
		modelsStorePath: join(agentDir, "models-store.json"),
		allowModelNetwork: false,
		refreshOnCreate: false,
	});
	models.registerProvider("task-test", {
		api: "openai-completions",
		baseUrl: `http://127.0.0.1:${server.port}/v1`,
		apiKey: "local-test-only",
		models: [
			{
				id: "task-stub",
				name: "Task stub",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 4096,
			},
		],
	});
	const loader = new DefaultResourceLoader({
		cwd: f.cwd,
		agentDir,
		settingsManager: settings,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
	});
	await loader.reload();
	class NativeDriver extends FakeTaskDriver {
		override async prepare(run: TaskRun, workspaceId: string) {
			const state = await super.prepare(run, workspaceId);
			if (!session) {
				const model = models.getModel("task-test", "task-stub");
				if (!model) throw new Error("Missing local test model");
				const reportTool: ToolDefinition = {
					name: "report_task_result",
					label: "Report task result",
					description: "Report this task candidate to the Host",
					parameters: {
						type: "object",
						properties: {
							runId: { type: "string" },
							iteration: { type: "integer" },
							outcome: { type: "string" },
							summary: { type: "string" },
							remaining: { type: "string" },
							criteria: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										status: { type: "string" },
										evidence: { type: "string" },
										checkIds: { type: "array", items: { type: "string" } },
									},
								},
							},
						},
						required: ["runId", "iteration", "outcome", "summary"],
					} as ToolDefinition["parameters"],
					execute: async (_id, args) => {
						const value = await f.store.reportCandidate(
							run.sessionId,
							taskCandidateSchema.parse(args),
						);
						return {
							content: [{ type: "text", text: JSON.stringify(value) }],
							details: value,
						};
					},
				};
				({ session } = await createAgentSession({
					cwd: f.cwd,
					agentDir,
					modelRuntime: models,
					model,
					thinkingLevel: "off",
					settingsManager: settings,
					sessionManager: SessionManager.inMemory(f.cwd),
					resourceLoader: loader,
					tools: ["write", "report_task_result"],
					customTools: [reportTool],
				}));
				session.subscribe((event) => {
					nativeEvents.push(event.type);
				});
			}
			return state;
		}
		override async submit(run: TaskRun, prompt: string) {
			await super.submit(run, prompt);
			if (!session) throw new Error("No native session");
			activePrompt = session.prompt(prompt).then(
				() => {
					this.finish(run);
				},
				(error) => {
					this.finish(run);
					const state = this.states.get(run.sessionId);
					if (state)
						this.states.set(run.sessionId, {
							...state,
							lastError: String(error),
						});
				},
			);
		}
		override async cancel(run: TaskRun) {
			await session?.abort();
			await activePrompt;
			await super.cancel(run);
		}
	}
	const driver = new NativeDriver();
	const runner = createTaskRunner({ store: f.store, driver });
	try {
		await runner.tick();
		await eventually(
			() => ["succeeded", "failed", "blocked"].includes(f.run().status),
			() => runner.tick(),
			20_000,
		);
		expect(f.run().reason).toBe(
			"All explicitly selected acceptance checks passed on unchanged inputs",
		);
		expect(f.run().status).toBe("succeeded");
		expect(f.run().repairCount).toBe(1);
		expect(driver.prepareCalls).toBe(2);
		expect(driver.submissions[0]?.run.sessionId).toBe(
			driver.submissions[1]?.run.sessionId,
		);
		expect(readFileSync(join(f.cwd, "value.txt"), "utf8")).toBe("right\n");
		expect(f.store.checks(f.runId).map((check) => check.status)).toEqual([
			"failed",
			"passed",
		]);
		expect(
			nativeEvents.filter((event) => event === "agent_settled"),
		).toHaveLength(2);
		expect(
			nativeEvents.filter((event) => event === "tool_execution_end"),
		).toHaveLength(4);
		expect(requests).toBe(6);
		expect(providerBodies).toHaveLength(6);
	} finally {
		await session?.abort();
		await activePrompt;
		await runner.dispose();
		session?.dispose();
		server.stop(true);
		await f.close();
	}
}, 30_000);
