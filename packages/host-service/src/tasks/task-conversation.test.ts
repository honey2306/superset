import { afterEach, describe, expect, test } from "bun:test";
import { ACP_AGENT_OPTIONS } from "@superset/shared/agent-catalog";
import type { AcpSessionRuntime } from "../runtime/acp-sessions/runtime";
import { TaskConversationService } from "./task-conversation";
import { eventually, taskFixture } from "./test-fixture";

const fixtures: Array<Awaited<ReturnType<typeof taskFixture>>> = [];
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
async function fixture() {
	const f = await taskFixture();
	fixtures.push(f);
	const original = f.run();
	f.runner.requestStop(f.runId, "cancelled");
	await eventually(
		() => f.run().status === "cancelled",
		() => f.runner.tick(),
	);
	f.store.removeTask(f.taskId);
	const sessionId = crypto.randomUUID();
	const state = await f.driver.prepare(
		{ ...original, sessionId },
		f.workspaceId,
	);
	state.configOptions = [
		{
			id: "model",
			name: "Model",
			type: "select",
			category: "model",
			currentValue: "actual-configured-model",
			options: [],
		},
	];
	let releases = 0,
		claims = 0;
	const sessions = {
		setTaskMode: async (input: {
			sessionId: string;
			mode: "inspect" | "claim" | "release";
			runId?: string;
		}) => {
			const current = f.driver.states.get(input.sessionId);
			if (!current) throw new Error("Unknown conversation");
			if (input.mode === "release") releases++;
			if (input.mode === "claim") claims++;
			return current;
		},
	} as Pick<AcpSessionRuntime, "setTaskMode"> as AcpSessionRuntime;
	const service = new TaskConversationService(f.runner, sessions);
	return {
		...f,
		service,
		sessionId,
		state,
		get releases() {
			return releases;
		},
		get claims() {
			return claims;
		},
		start: (
			id = crypto.randomUUID(),
			text = "Implement the approach discussed above",
		) => service.start({ id, sessionId, prompt: [{ type: "text", text }] }),
	};
}
describe("Task as a normal conversation mode", () => {
	test("adopts the existing session/model/workspace, never creates a new chat or grants Git permissions", async () => {
		const f = await fixture();
		const result = await f.start();
		if (!result.run) throw new Error("Missing run");
		await eventually(
			() => f.driver.submissions.length === 1,
			() => f.runner.tick(),
		);
		expect(result.run.sessionId).toBe(f.sessionId);
		expect(f.driver.states.size).toBe(1);
		expect(result.run.fromConversation).toBe(true);
		expect(result.run.contract.model).toBe("actual-configured-model");
		expect(result.run.contract.delivery).toEqual({ mode: "none" });
		expect(f.service.get(f.sessionId)?.owned).toBe(true);
	});
	test("a request acknowledgement retry returns the same task even while its native turn is running", async () => {
		const f = await fixture();
		const id = crypto.randomUUID();
		const first = await f.start(id);
		await eventually(
			() => f.driver.submissions.length === 1,
			() => f.runner.tick(),
		);
		const second = await f.start(id);
		expect(second.task.id).toBe(first.task.id);
		expect(second.run?.id).toBe(first.run?.id);
		expect(f.driver.submissions).toHaveLength(1);
		await expect(f.start(id, "Different goal")).rejects.toThrow(
			"different input",
		);
		await expect(f.start()).rejects.toThrow("already owns");
	});
	test("does not interrupt a running/permission-pending chat just to switch mode", async () => {
		const f = await fixture();
		f.state.status = "running";
		await expect(f.start()).rejects.toThrow("current conversation turn");
		expect(f.store.list()).toHaveLength(0);
	});
	test("attachments are preserved in durable admission, not converted to an empty text task", async () => {
		const f = await fixture();
		const image = {
			type: "image" as const,
			mimeType: "image/png",
			data: "dGVzdA==",
		};
		const result = await f.service.start({
			id: crypto.randomUUID(),
			sessionId: f.sessionId,
			prompt: [{ type: "text", text: "Fix this screenshot" }, image],
		});
		expect(result.run?.initialAttachments).toEqual([image]);
	});
	test("finish/cancel then return to chat retains history and permits a new Task in the SAME session", async () => {
		const f = await fixture();
		const first = await f.start();
		if (!first.run) throw new Error("No run");
		await eventually(
			() => f.driver.submissions.length === 1,
			() => f.runner.tick(),
		);
		await expect(f.service.release(first.run.id)).rejects.toThrow(
			"Finish or cancel",
		);
		const firstRunId = first.run.id;
		f.runner.requestStop(firstRunId, "cancelled");
		await eventually(
			() => f.store.getRun(firstRunId).status === "cancelled",
			() => f.runner.tick(),
		);
		await f.service.release(first.run.id);
		await f.service.release(first.run.id);
		expect(f.releases).toBe(1);
		expect(f.store.bySession(f.sessionId)).toBeUndefined();
		expect(f.service.get(f.sessionId)?.owned).toBe(false);
		const second = await f.start();
		expect(second.run?.sessionId).toBe(f.sessionId);
		expect(second.run?.id).not.toBe(first.run.id);
		expect(f.store.list()).toHaveLength(2);
		await expect(
			f.store.reportCandidate(f.sessionId, {
				runId: first.run.id,
				iteration: 0,
				outcome: "ready",
				summary: "late",
			}),
		).rejects.toThrow("stale");
	});
	test("an unmatched execution directory cannot be adopted by choosing a different project", async () => {
		const f = await fixture();
		f.state.cwd = f.directory;
		await expect(f.start()).rejects.toThrow("does not match");
		expect(f.store.list()).toHaveLength(0);
	});
	for (const agent of ACP_AGENT_OPTIONS) {
		test(`adopts ${agent.label} from the common ACP catalog without replacing its session/model`, async () => {
			const f = await fixture();
			f.state.harness = agent.harness;
			const started = await f.start();
			expect(started.run?.sessionId).toBe(f.sessionId);
			expect(started.run?.contract.harness).toBe(agent.harness);
			expect(started.run?.contract.model).toBe("actual-configured-model");
			expect(started.run?.contract.delivery).toEqual({ mode: "none" });
			expect(f.driver.states.size).toBe(1);
		});
	}
});
