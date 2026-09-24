import { describe, expect, test } from "bun:test";
import { ComputerUseCoordinator } from "./computer-use-coordinator";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("ComputerUseCoordinator", () => {
	test("keeps a desktop lease across calls in the same turn", async () => {
		const coordinator = new ComputerUseCoordinator(1_000, 1_000);
		const first = await coordinator.run(
			"session-a",
			async (generation) => generation,
		);
		const second = await coordinator.run(
			"session-a",
			async (generation) => generation,
		);

		expect(first.generation).toBe(second.generation);
		expect(coordinator.state().ownerSessionId).toBe("session-a");
		coordinator.shutdown();
	});

	test("serializes concurrent calls from the same session", async () => {
		const coordinator = new ComputerUseCoordinator(1_000, 1_000);
		const events: string[] = [];
		let releaseFirst: (() => void) | undefined;

		const first = coordinator.run("session-a", async () => {
			events.push("first-start");
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			events.push("first-end");
			return "first";
		});
		await tick();

		const second = coordinator.run("session-a", async () => {
			events.push("second-start");
			return "second";
		});
		await tick();

		expect(events).toEqual(["first-start"]);
		expect(coordinator.state()).toMatchObject({
			ownerSessionId: "session-a",
			activeCalls: 2,
		});

		releaseFirst?.();
		expect((await first).result).toBe("first");
		expect((await second).result).toBe("second");
		expect(events).toEqual(["first-start", "first-end", "second-start"]);
		coordinator.shutdown();
	});

	test("does not dispatch a cancelled same-session call that is still queued", async () => {
		const coordinator = new ComputerUseCoordinator(1_000, 1_000);
		let releaseFirst: (() => void) | undefined;
		let secondRan = false;
		const first = coordinator.run("session-a", async () => {
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
		});
		await tick();

		const controller = new AbortController();
		const second = coordinator
			.run(
				"session-a",
				async () => {
					secondRan = true;
				},
				controller.signal,
			)
			.then(
				() => "unexpected success",
				(error: Error) => `${error.name}:${error.message}`,
			);
		await tick();
		controller.abort();
		releaseFirst?.();
		await first;

		expect(await second).toMatch(/abort/i);
		expect(secondRan).toBe(false);
		coordinator.shutdown();
	});

	test("does not interleave another session until the owner ends its turn", async () => {
		const coordinator = new ComputerUseCoordinator(1_000, 1_000);
		const events: string[] = [];
		await coordinator.run("session-a", async () => {
			events.push("a-action");
		});

		const waiting = coordinator.run("session-b", async () => {
			events.push("b-action");
			return "done";
		});
		await tick();
		expect(events).toEqual(["a-action"]);
		expect(coordinator.state()).toMatchObject({
			ownerSessionId: "session-a",
			waiting: 1,
		});

		coordinator.endTurn("session-a");
		expect((await waiting).result).toBe("done");
		expect(events).toEqual(["a-action", "b-action"]);
		expect(coordinator.state().ownerSessionId).toBe("session-b");
		coordinator.shutdown();
	});

	test("releases immediately after an active call finishes when its turn already ended", async () => {
		const coordinator = new ComputerUseCoordinator(10_000, 1_000);
		let finishA: (() => void) | undefined;
		const a = coordinator.run("session-a", async () => {
			await new Promise<void>((resolve) => {
				finishA = resolve;
			});
			return "a";
		});
		await tick();

		const b = coordinator.run("session-b", async () => "b");
		await tick();
		expect(coordinator.state()).toMatchObject({
			ownerSessionId: "session-a",
			activeCalls: 1,
			waiting: 1,
		});

		coordinator.endTurn("session-a");
		finishA?.();

		expect((await a).result).toBe("a");
		expect((await b).result).toBe("b");
		expect(coordinator.state().ownerSessionId).toBe("session-b");
		coordinator.shutdown();
	});

	test("cancels a waiting lease without disturbing the current owner", async () => {
		const coordinator = new ComputerUseCoordinator(1_000, 1_000);
		await coordinator.run("session-a", async () => undefined);

		const controller = new AbortController();
		const waiting = coordinator
			.run("session-b", async () => "unexpected", controller.signal)
			.then(
				() => "unexpected success",
				(error: Error) => error.message,
			);
		controller.abort();

		expect(await waiting).toContain("cancelled");
		expect(coordinator.state()).toMatchObject({
			ownerSessionId: "session-a",
			waiting: 0,
		});
		coordinator.shutdown();
	});
});
