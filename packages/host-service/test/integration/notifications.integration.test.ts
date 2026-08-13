import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";
import { seedTerminalSession } from "../helpers/seed";

describe("notifications.hook integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("primary commit followed by fallback replay records state once", async () => {
		const { id: terminalId } = seedTerminalSession(scenario.host, {
			id: randomUUID(),
			originWorkspaceId: scenario.workspaceId,
		});
		const eventId = randomUUID();
		const occurredAt = Date.now();
		const input = {
			terminalId,
			eventType: "Stop",
			eventId,
			occurredAt,
			capabilityToken: scenario.host.notificationHookCapability(terminalId),
			agent: { agentId: "claude" },
		};

		// The first response can be lost after the host commits. Reissuing the
		// exact payload models the Electron fallback carrying the same identity.
		const primary =
			await scenario.host.unauthenticatedTrpc.notifications.hook.mutate(input);
		const fallback =
			await scenario.host.unauthenticatedTrpc.notifications.hook.mutate(input);

		expect(primary).toEqual({ success: true, ignored: false });
		expect(fallback).toEqual({
			success: true,
			ignored: false,
			duplicate: true,
		});
		const bindings = await scenario.host.trpc.terminalAgents.list.query();
		expect(bindings).toHaveLength(1);
		expect(bindings[0]).toMatchObject({
			terminalId,
			lastEventAt: occurredAt,
			lastEventType: "Stop",
		});
	});

	test("rejects invalid capabilities and suppresses replay side effects", async () => {
		const { id: terminalId } = seedTerminalSession(scenario.host, {
			id: randomUUID(),
			originWorkspaceId: scenario.workspaceId,
		});
		const base = {
			terminalId,
			eventType: "Start",
			eventId: randomUUID(),
			occurredAt: Date.now(),
			agent: { agentId: "claude" },
		};

		await expect(
			scenario.host.unauthenticatedTrpc.notifications.hook.mutate({
				...base,
				capabilityToken: "x".repeat(32),
			}),
		).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });

		const capabilityToken =
			scenario.host.notificationHookCapability(terminalId);
		await scenario.host.unauthenticatedTrpc.notifications.hook.mutate({
			...base,
			capabilityToken,
		});
		const replay =
			await scenario.host.unauthenticatedTrpc.notifications.hook.mutate({
				...base,
				capabilityToken,
			});
		expect(replay).toMatchObject({ duplicate: true });
		const bindings = await scenario.host.trpc.terminalAgents.list.query();
		expect(bindings).toHaveLength(1);
	});
});
