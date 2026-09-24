import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { taskProfileSchema } from "@superset/shared/tasks";
import { ProjectTaskVerification } from "./checks/task-verification";
import type { TaskDeliveryCapability } from "./delivery/task-delivery-capability";
import { taskPrompt } from "./task-policy";
import { TaskRunner } from "./task-runner";
import { eventually, taskFixture } from "./test-fixture";

type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const fixtures: Fixture[] = [];
const runners: TaskRunner[] = [];
afterEach(async () => {
	for (const runner of runners.splice(0)) await runner.dispose();
	for (const f of fixtures.splice(0)) await f.close();
});
function unavailableDelivery(): TaskDeliveryCapability {
	return {
		execute: mock(async () => {
			throw new Error("Optional Git capability should not run");
		}),
		hasUnresolved: () => false,
		reconcile: async () => {},
		releasePrepared: async () => {},
		retry: async () => {},
	};
}
describe("Task core and optional capability boundary", () => {
	test("a small edits-only task completes without a Git executor, skill router or extra prompt", async () => {
		const f = await taskFixture();
		fixtures.push(f);
		const delivery = unavailableDelivery();
		const runner = new TaskRunner({
			store: f.store,
			driver: f.driver,
			verification: new ProjectTaskVerification(f.store),
			delivery,
		});
		runners.push(runner);
		await runner.tick();
		await f.ready();
		await eventually(
			() => f.run().status === "awaiting_review",
			() => runner.tick(),
		);
		await runner.accept(f.runId);
		expect(f.run().status).toBe("succeeded");
		expect(delivery.execute).toHaveBeenCalledTimes(0);
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("the task prompt keeps constraints and a check index, but retrieves command details only on demand", async () => {
		const f = await taskFixture();
		fixtures.push(f);
		const profile = {
			revision: 7,
			config: taskProfileSchema.parse({
				instructions: "Keep the public API unchanged",
				checks: [
					{
						id: "behavior",
						name: "Behavior regression",
						command: "bun run expensive-private-command",
						paths: ["private-internal-path/**"],
						timeoutMs: 1000,
					},
				],
			}),
		};
		f.store.patch(f.runId, { profile });
		const prompt = taskPrompt({
			runId: f.runId,
			iteration: 0,
			contract: f.run().contract,
			profile,
		});
		expect(prompt).toContain("Keep the public API unchanged");
		expect(prompt).toContain("behavior: Behavior regression");
		expect(prompt).not.toContain("expensive-private-command");
		expect(prompt).not.toContain("private-internal-path");
		expect(JSON.stringify(f.store.context(f.run().sessionId))).toContain(
			"expensive-private-command",
		);
	});
	test("core source does not import concrete delivery or a Skill/Memory workflow registry", () => {
		const core = readFileSync(join(import.meta.dir, "task-runner.ts"), "utf8");
		expect(core).not.toContain('from "./delivery/git-delivery"');
		expect(core).not.toContain("new GitTaskDelivery");
		expect(core).not.toContain("loadSkills");
		expect(core).not.toContain("search_project_memories");
	});
});
