import { expect, test } from "bun:test";
import { taskProfileSchema } from "@superset/shared/tasks";
import { createTaskTransportFixture } from "./task-transport-fixture";

async function until<T>(
	get: () => Promise<T>,
	done: (value: T) => boolean,
	label: string,
	timeout = 35000,
) {
	const deadline = Date.now() + timeout;
	let value: T;
	for (;;) {
		value = await get();
		if (done(value)) return value;
		if (Date.now() > deadline)
			throw new Error(`${label}: ${JSON.stringify(value)}`);
		await new Promise((resolve) => setTimeout(resolve, 80));
	}
}
test("real normal Pi chat becomes a Task in-place, recovers a premature stop, retains context and returns to normal chat", async () => {
	const f = await createTaskTransportFixture({
		conversationMode: true,
		stopFirstTaskTurn: true,
		delayMs: 80,
	});
	const sessionId = crypto.randomUUID();
	try {
		await f.api.acpSessions.create.mutate({
			sessionId,
			workspaceId: f.workspaceId,
			harness: "pi-acp",
			model: "task-local/task-model",
		});
		await f.api.acpSessions.prompt.mutate({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Discuss the approach and remember CONTEXT_KEEP_42, without modifying code yet.",
				},
			],
		});
		await until(
			() => f.api.acpSessions.get.query({ sessionId }),
			(state) => state.status === "idle" && Boolean(state.lastCompletedAt),
			"ordinary chat not complete",
		);
		const before = await f.api.acpSessions.getTranscript.query({ sessionId });
		expect(before.totalTurns).toBe(1);
		expect(JSON.stringify(before)).toContain("CONTEXT_KEEP_42");
		expect(await f.api.tasks.forSession.query({ sessionId })).toBeNull();
		await f.api.tasks.saveProfile.mutate({
			projectId: f.projectId,
			expectedRevision: 0,
			config: taskProfileSchema.parse({
				completion: "checks",
				checks: [
					{
						id: "value",
						name: "Value matches the agreed behavior",
						command: 'test "$(cat value.txt)" = right',
						paths: [],
					},
				],
			}),
		});
		const id = crypto.randomUUID();
		const request = {
			id,
			sessionId,
			prompt: [
				{
					type: "text" as const,
					text: "Implement the approach discussed above: value.txt should contain right.",
				},
			],
		};
		const created = await f.api.tasks.startFromConversation.mutate(request);
		expect(created.run?.sessionId).toBe(sessionId);
		expect(created.run?.fromConversation).toBe(true);
		const repeat = await f.api.tasks.startFromConversation.mutate(request);
		expect(repeat.run?.id).toBe(created.run?.id);
		const done = await until(
			() => f.api.tasks.forSession.query({ sessionId }),
			(data) =>
				Boolean(
					data &&
						["succeeded", "failed", "blocked", "awaiting_review"].includes(
							data.run.status,
						),
				),
			"adopted Task not complete",
		);
		expect(done?.run.reason).toBe(
			"All explicitly selected acceptance checks passed on unchanged inputs",
		);
		expect(done?.run.status).toBe("succeeded");
		expect(done?.run.continuationCount).toBe(1);
		expect(done?.run.reportRecoveryCount).toBe(1);
		expect(done?.checks.map((check) => check.status)).toEqual(["passed"]);
		expect(f.modelInputs.every((input) => input.conversationContextSeen)).toBe(
			true,
		);
		const transcript = await f.api.acpSessions.getTranscript.query({
			sessionId,
		});
		expect(transcript.totalTurns).toBe(3);
		expect(JSON.stringify(transcript)).toContain("CONTEXT_KEEP_42");
		// UI projection must not repeat hundreds of words of Task policy as user messages.
		expect(JSON.stringify(transcript)).not.toContain(
			"These delivery operations are NOT authorized to the Agent",
		);
		await f.api.acpSessions.close.mutate({ sessionId });
		expect((await f.api.acpSessions.get.query({ sessionId })).status).toBe(
			"idle",
		);
		if (!done) throw new Error("Missing task");
		await f.api.tasks.releaseConversation.mutate({ runId: done.run.id });
		expect((await f.api.tasks.forSession.query({ sessionId }))?.owned).toBe(
			false,
		);
		await f.api.acpSessions.prompt.mutate({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Now summarize our original CONTEXT_KEEP_42 discussion in ordinary chat.",
				},
			],
		});
		await until(
			() => f.api.acpSessions.getTranscript.query({ sessionId }),
			(history) => history.totalTurns === 4,
			"ordinary chat did not resume",
		);
		expect((await f.api.tasks.list.query()).length).toBe(1);
		const live = await f.api.acpSessions.list.query({
			workspaceId: f.workspaceId,
		});
		expect(live.items.length).toBe(1);
	} catch (error) {
		throw new Error(`${String(error)}\n${f.logs()}`);
	} finally {
		await f.close();
	}
}, 90000);
