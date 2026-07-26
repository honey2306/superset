import { beforeEach, describe, expect, it, mock } from "bun:test";

const legacyKill = mock(async () => {});

mock.module("../../../lib/trpc-client", () => ({
	electronTrpcClient: {
		terminal: {
			kill: {
				mutate: legacyKill,
			},
		},
	},
}));

mock.module("../../../lib/terminal/session-readiness", () => ({
	rejectTerminalSessionReady: mock(() => {}),
}));

const { killTerminalForPane, registerTerminalCleanup } = await import(
	"./terminal-cleanup"
);

describe("terminal cleanup routing", () => {
	beforeEach(() => {
		legacyKill.mockClear();
	});

	it("uses a registered host-service cleanup instead of legacy terminal IPC", async () => {
		const hostCleanup = mock(async () => {});
		registerTerminalCleanup("host-pane", hostCleanup);

		killTerminalForPane("host-pane");
		await Promise.resolve();

		expect(hostCleanup).toHaveBeenCalledTimes(1);
		expect(legacyKill).not.toHaveBeenCalled();
	});

	it("unregistering a hidden pane does not run its destructive cleanup", async () => {
		const hostCleanup = mock(async () => {});
		const unregister = registerTerminalCleanup("hidden-pane", hostCleanup);

		unregister();
		await Promise.resolve();

		expect(hostCleanup).not.toHaveBeenCalled();
	});

	it("falls back to legacy terminal IPC when no host cleanup is registered", async () => {
		killTerminalForPane("legacy-pane");
		await Promise.resolve();

		expect(legacyKill).toHaveBeenCalledWith({ paneId: "legacy-pane" });
	});
});
