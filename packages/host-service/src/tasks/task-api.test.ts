import { afterEach, describe, expect, mock, test } from "bun:test";
import { appRouter } from "../trpc/router/router";
import { eventually, taskFixture } from "./test-fixture";

type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const fixtures: Fixture[] = [];
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
async function fixture() {
	const f = await taskFixture();
	fixtures.push(f);
	return f;
}
function caller(
	f: Fixture,
	enabled = true,
	authKind = "psk",
	isAuthenticated = true,
) {
	const close = mock(async () => {}),
		prompt = mock(async () => ({ accepted: true })),
		cancel = mock(async () => {}),
		response = mock(async () => ({ accepted: true }));
	const runtime = {
		tasks: f.runner,
		acpSessionsEnabled: enabled,
		acpSessions: { close, prompt, cancel, respondToPermission: response },
	};
	return {
		api: appRouter.createCaller({
			db: f.db,
			runtime,
			isAuthenticated,
			authKind,
			organizationId: "test",
		} as never),
		close,
		prompt,
		cancel,
		response,
	};
}
describe("managed task API boundaries", () => {
	test("tasks are authenticated and not silently enabled for paired phones", async () => {
		const f = await fixture();
		await expect(
			caller(f, true, "psk", false).api.tasks.list(),
		).rejects.toThrow("authentication");
		await expect(caller(f, true, "phone").api.tasks.list()).rejects.toThrow(
			"paired phone",
		);
	});
	test("read-only history works with execution disabled but new starts do not", async () => {
		const f = await fixture();
		const { api } = caller(f, false);
		expect((await api.tasks.list())[0]?.task.id).toBe(f.taskId);
		await expect(
			api.tasks.create({
				id: crypto.randomUUID(),
				projectId: f.projectId,
				contract: f.run().contract,
			}),
		).rejects.toThrow("Enable ACP");
	});
	test("closing a managed view does not destroy or stop its session", async () => {
		const f = await fixture();
		const { api, close } = caller(f);
		await api.acpSessions.close({ sessionId: f.run().sessionId });
		expect(close).toHaveBeenCalledTimes(0);
		expect(f.run().status).toBe("queued");
		await api.acpSessions.close({ sessionId: crypto.randomUUID() });
		expect(close).toHaveBeenCalledTimes(1);
	});
	test("direct chat mutation cannot bypass task controls", async () => {
		const f = await fixture();
		const { api, prompt } = caller(f);
		await expect(
			api.acpSessions.prompt({
				sessionId: f.run().sessionId,
				prompt: [{ type: "text", text: "do other work" }],
			}),
		).rejects.toThrow("Task controls");
		expect(prompt).toHaveBeenCalledTimes(0);
	});
	test("existing session cancel is routed to the whole managed task", async () => {
		const f = await fixture();
		const { api, cancel } = caller(f);
		await api.acpSessions.cancel({ sessionId: f.run().sessionId });
		expect(f.run().desiredState).toBe("cancelled");
		expect(cancel).toHaveBeenCalledTimes(0);
		await eventually(
			() => f.run().status === "cancelled",
			() => f.runner.tick(),
		);
		expect(
			(await api.tasks.remove({ id: f.taskId })).conversationsRetained,
		).toBe(true);
	});
	test("workspace and project cleanup refuse before filesystem side effects", async () => {
		const f = await fixture();
		const { api } = caller(f);
		const inspection = await api.workspaceCleanup.inspect({
			workspaceId: f.workspaceId,
		});
		expect(inspection.canDelete).toBe(false);
		expect(inspection.reason).toContain("managed task records");
		await expect(
			api.workspaceCleanup.destroy({
				workspaceId: f.workspaceId,
				deleteBranch: false,
				force: true,
			}),
		).rejects.toThrow("managed task records");
		await expect(
			api.project.remove({ projectId: f.projectId }),
		).rejects.toThrow("managed task records");
	});
	test("profile updates and live guidance obey authentication and revision checks", async () => {
		const f = await fixture();
		const { api } = caller(f);
		expect((await api.tasks.profile({ projectId: f.projectId })).revision).toBe(
			0,
		);
		const config = {
			instructions: "Keep scope",
			checks: [],
			completion: "review" as const,
		};
		expect(
			(
				await api.tasks.saveProfile({
					projectId: f.projectId,
					expectedRevision: 0,
					config,
				})
			).revision,
		).toBe(1);
		await expect(
			api.tasks.saveProfile({
				projectId: f.projectId,
				expectedRevision: 0,
				config,
			}),
		).rejects.toThrow("changed");
		await expect(
			caller(f, true, "phone").api.tasks.saveProfile({
				projectId: f.projectId,
				expectedRevision: 1,
				config,
			}),
		).rejects.toThrow("paired phone");
		const added = await api.tasks.guide({
			id: crypto.randomUUID(),
			runId: f.runId,
			expectedRevision: 0,
			text: "Keep this original implementation",
			kind: "guidance",
		});
		expect(added.revision).toBe(1);
		expect((await api.tasks.get({ id: f.taskId })).guidance).toHaveLength(1);
		await expect(
			api.tasks.guide({
				id: crypto.randomUUID(),
				runId: f.runId,
				expectedRevision: 0,
				text: "stale",
				kind: "guidance",
			}),
		).rejects.toThrow("changed");
	});
	test("Git delivery controls require authentication and do not expose arbitrary remote URLs", async () => {
		const f = await fixture();
		await expect(
			caller(f, true, "psk", false).api.tasks.deliveryTargets({
				workspaceId: f.workspaceId,
			}),
		).rejects.toThrow("authentication");
		await expect(
			caller(f, true, "phone").api.tasks.retryDelivery({ runId: f.runId }),
		).rejects.toThrow("paired phone");
		const { api } = caller(f);
		const target = await api.tasks.deliveryTargets({
			workspaceId: f.workspaceId,
		});
		expect(target.branch.length).toBeGreaterThan(0);
		expect(target.remotes).toEqual([]);
		await expect(api.tasks.retryDelivery({ runId: f.runId })).rejects.toThrow();
		await api.tasks.revokeDelivery({ runId: f.runId });
		expect(f.run().deliveryRevoked).toBe(true);
		expect(f.run().phase).toBe("preparing");
	});
});
