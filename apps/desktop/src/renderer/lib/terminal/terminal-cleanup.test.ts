import { describe, expect, it, mock } from "bun:test";
import {
	killTerminalForPane,
	killTerminalForPaneOrSession,
	registerTerminalCleanup,
} from "./terminal-cleanup";

describe("terminal cleanup routing", () => {
	it("runs the registered host-service cleanup", async () => {
		const hostCleanup = mock(async () => {});
		registerTerminalCleanup("host-pane", hostCleanup);

		expect(killTerminalForPane("host-pane")).toBe(true);
		await Promise.resolve();

		expect(hostCleanup).toHaveBeenCalledTimes(1);
	});

	it("unregistering a hidden pane does not run its destructive cleanup", async () => {
		const hostCleanup = mock(async () => {});
		const unregister = registerTerminalCleanup("hidden-pane", hostCleanup);

		unregister();
		await Promise.resolve();

		expect(hostCleanup).not.toHaveBeenCalled();
	});

	it("does not fall back to legacy Electron terminal IPC", async () => {
		expect(killTerminalForPane("missing-pane")).toBe(false);
		await Promise.resolve();
	});

	it("kills the host session directly when the pane never mounted", () => {
		const killSession = mock<(terminalId: string) => void>();

		killTerminalForPaneOrSession(
			"never-mounted-pane",
			"persisted-terminal",
			killSession,
		);

		expect(killSession).toHaveBeenCalledWith("persisted-terminal");
	});

	it("prefers registered cleanup for mounted panes", async () => {
		const hostCleanup = mock(async () => {});
		const killSession = mock<(terminalId: string) => void>();
		registerTerminalCleanup("mounted-pane", hostCleanup);

		killTerminalForPaneOrSession(
			"mounted-pane",
			"persisted-terminal",
			killSession,
		);
		await Promise.resolve();

		expect(hostCleanup).toHaveBeenCalledTimes(1);
		expect(killSession).not.toHaveBeenCalled();
	});
});
