import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("agents router local Superset chat dispatch", () => {
	let host: TestHost;
	const projectId = randomUUID();
	const workspaceId = randomUUID();
	const chatCalls: unknown[] = [];

	beforeEach(async () => {
		chatCalls.length = 0;
		host = await createTestHost({
			chatRuntime: {
				sendMessage: async (input: unknown) => {
					chatCalls.push(input);
					return { ok: true };
				},
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: "/tmp/local-agent-project" })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: "/tmp/local-agent-project",
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("Superset chat agent starts locally without calling the cloud API", async () => {
		const result = await host.trpc.agents.run.mutate({
			workspaceId,
			agent: "superset",
			prompt: "hello",
		});

		expect(result).toMatchObject({ kind: "chat", label: "Superset" });
		expect(result.sessionId).toBeString();
		expect(chatCalls).toHaveLength(1);
		expect(chatCalls[0]).toMatchObject({
			workspaceId,
			payload: { content: "hello" },
		});
		expect(host.apiCalls).toEqual([]);
	});
});
