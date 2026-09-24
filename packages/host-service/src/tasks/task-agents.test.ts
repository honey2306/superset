import { afterEach, describe, expect, mock, test } from "bun:test";
import type {
	HarnessKind,
	SessionScopedState,
} from "@superset/session-protocol";
import {
	ACP_AGENT_OPTIONS,
	ACP_HARNESSES,
} from "@superset/shared/agent-catalog";
import type { AcpSessionRuntime } from "../runtime/acp-sessions/runtime";
import { SessionTaskDriver } from "./execution-driver";
import { taskFixture } from "./test-fixture";

const fixtures: Array<Awaited<ReturnType<typeof taskFixture>>> = [];
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
describe("common Task execution driver", () => {
	test("the catalog remains type compatible with every registered session protocol harness", () => {
		const typed: readonly HarnessKind[] = ACP_HARNESSES;
		expect(typed).toHaveLength(ACP_AGENT_OPTIONS.length);
	});
	for (const agent of ACP_AGENT_OPTIONS) {
		test(`${agent.label}: create, native capability or queued guidance keep the same engine`, async () => {
			const f = await taskFixture({ harness: agent.harness });
			fixtures.push(f);
			const base = await f.driver.prepare(f.run(), f.workspaceId);
			const state: SessionScopedState = {
				...base,
				status: "running",
				canSteer: true,
			};
			const create = mock(
					async (_input: Parameters<AcpSessionRuntime["create"]>[0]) => base,
				),
				steerPrompt = mock(async () => ({ accepted: true })),
				enqueuePrompt = mock(async () => ({ queueId: "queue" }));
			const sessions = {
				get: async () => state,
				create,
				steerPrompt,
				enqueuePrompt,
			} as unknown as AcpSessionRuntime;
			const driver = new SessionTaskDriver(sessions);
			await driver.prepare(f.run(), f.workspaceId);
			expect(create.mock.calls[0]?.[0]).toMatchObject({
				harness: agent.harness,
				sessionId: f.run().sessionId,
				role: "task-executor",
			});
			expect(await driver.guide(f.run(), "guidance", "guide-1")).toBe("native");
			expect(steerPrompt).toHaveBeenCalledTimes(1);
			expect(enqueuePrompt).toHaveBeenCalledTimes(0);
			state.canSteer = false;
			expect(await driver.guide(f.run(), "guidance", "guide-2")).toBe("queued");
			expect(enqueuePrompt).toHaveBeenCalledTimes(1);
			expect(create).toHaveBeenCalledTimes(1);
		});
	}
	test("an ambiguous native acknowledgement is never followed by duplicate queued work", async () => {
		const f = await taskFixture({ harness: "codex-app-server" });
		fixtures.push(f);
		const base = await f.driver.prepare(f.run(), f.workspaceId);
		const enqueuePrompt = mock(async () => ({ queueId: "duplicate" }));
		const sessions = {
			get: async () => ({ ...base, status: "running", canSteer: true }),
			steerPrompt: async () => {
				throw new Error("acknowledgement lost");
			},
			enqueuePrompt,
		} as unknown as AcpSessionRuntime;
		await expect(
			new SessionTaskDriver(sessions).guide(f.run(), "guide", "id"),
		).rejects.toThrow("acknowledgement lost");
		expect(enqueuePrompt).toHaveBeenCalledTimes(0);
	});
});
