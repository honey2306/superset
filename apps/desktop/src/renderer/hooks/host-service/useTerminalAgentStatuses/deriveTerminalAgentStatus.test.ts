import { describe, expect, it } from "bun:test";
import {
	deriveTerminalAgentStatus,
	deriveTerminalAgentStatuses,
	getHighestTerminalAgentStatus,
	settleClearedTerminalAgentBindings,
} from "./deriveTerminalAgentStatus";

describe("deriveTerminalAgentStatus", () => {
	it("maps Start to working", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Start",
				lastEventAt: 100,
				lastSeenAt: 200,
			}),
		).toBe("working");
	});

	it("maps PermissionRequest to permission regardless of seen timestamp", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "PermissionRequest",
				lastEventAt: 100,
				lastSeenAt: 200,
			}),
		).toBe("permission");
	});

	it("maps an unseen Stop to review", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Stop",
				lastEventAt: 200,
				lastSeenAt: 100,
			}),
		).toBe("review");
	});

	it("maps a never-seen Stop to review", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Stop",
				lastEventAt: 100,
				lastSeenAt: undefined,
			}),
		).toBe("review");
	});

	it("maps a seen Stop to idle", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Stop",
				lastEventAt: 100,
				lastSeenAt: 100,
			}),
		).toBe("idle");
	});

	it("maps Failed to failed regardless of seen timestamp", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Failed",
				lastEventAt: 100,
				lastSeenAt: 200,
			}),
		).toBe("failed");
	});

	it("maps Attached to idle", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "Attached",
				lastEventAt: 100,
				lastSeenAt: undefined,
			}),
		).toBe("idle");
	});

	it("maps unknown event types to idle", () => {
		expect(
			deriveTerminalAgentStatus({
				lastEventType: "SomethingNew",
				lastEventAt: 100,
				lastSeenAt: undefined,
			}),
		).toBe("idle");
	});

	it("derives statuses and highest priority from explicit-host bindings", () => {
		const bindings = new Map([
			[
				"terminal-working",
				{
					terminalId: "terminal-working",
					lastEventType: "Start",
					lastEventAt: 100,
				},
			],
			[
				"terminal-failed",
				{
					terminalId: "terminal-failed",
					lastEventType: "Failed",
					lastEventAt: 200,
				},
			],
			[
				"terminal-permission",
				{
					terminalId: "terminal-permission",
					lastEventType: "PermissionRequest",
					lastEventAt: 300,
				},
			],
		]);

		const statuses = deriveTerminalAgentStatuses(bindings, {});

		expect(statuses.get("terminal-working")).toBe("working");
		expect(statuses.get("terminal-failed")).toBe("failed");
		expect(statuses.get("terminal-permission")).toBe("permission");
		expect(getHighestTerminalAgentStatus(bindings, {})).toBe("permission");
	});

	it("keeps a Stop in review until its persisted terminal seen timestamp reaches it", () => {
		const bindings = new Map([
			[
				"terminal-1",
				{
					terminalId: "terminal-1",
					lastEventType: "Stop",
					lastEventAt: 200,
				},
			],
		]);

		expect(getHighestTerminalAgentStatus(bindings, {})).toBe("review");
		expect(getHighestTerminalAgentStatus(bindings, { "terminal-1": 100 })).toBe(
			"review",
		);
		expect(
			getHighestTerminalAgentStatus(bindings, { "terminal-1": 200 }),
		).toBeNull();
	});

	it("settles current and refreshed cleared bindings around the host refresh", async () => {
		const calls: string[] = [];
		const bindings = new Map([
			[
				"terminal-1",
				{
					terminalId: "terminal-1",
					lastEventType: "Start",
					lastEventAt: 200,
				},
			],
		]);
		const refreshedBindings = new Map([
			[
				"terminal-2",
				{
					terminalId: "terminal-2",
					lastEventType: "Stop",
					lastEventAt: 300,
				},
			],
		]);

		await settleClearedTerminalAgentBindings({
			bindings,
			markTerminalSeen: (terminalId, at) => {
				calls.push(`seen:${terminalId}:${at}`);
			},
			refresh: async () => {
				calls.push("refresh");
			},
			readRefreshedBindings: () => refreshedBindings,
		});

		expect(calls).toEqual([
			"seen:terminal-1:200",
			"refresh",
			"seen:terminal-2:300",
		]);
	});
});
