import { describe, expect, it, mock } from "bun:test";
import { createHostTerminalLauncher } from "./host-terminal-launcher";

function createHarness() {
	const createSession = mock(async (input: { terminalId?: string }) => ({
		terminalId: input.terminalId ?? "generated",
		status: "active" as const,
	}));
	const writeInput = mock(async () => ({ success: true as const }));
	const killSession = mock(async () => ({ success: true as const }));
	const launcher = createHostTerminalLauncher({
		resolveTarget: (workspaceId) =>
			workspaceId === "catalog-ws"
				? { hostUrl: "http://127.0.0.1:4321", workspaceId }
				: null,
		getClient: () =>
			({
				terminal: {
					createSession: { mutate: createSession },
					writeInput: { mutate: writeInput },
					killSession: { mutate: killSession },
				},
			}) as never,
	});
	return { launcher, createSession, writeInput, killSession };
}

describe("host terminal launcher", () => {
	it("launches an initial command without waiting for pane registration", async () => {
		const { launcher, createSession, writeInput } = createHarness();
		await launcher.launchCommand({
			workspaceId: "catalog-ws",
			terminalId: "pane-1",
			command: "bun dev",
			cwd: "/repo",
		});

		expect(createSession).toHaveBeenCalledWith({
			workspaceId: "catalog-ws",
			terminalId: "pane-1",
			initialCommand: "bun dev\n",
			cwd: "/repo",
			cols: undefined,
			rows: undefined,
			themeType: undefined,
		});
		expect(writeInput).not.toHaveBeenCalled();
	});

	it("creates then writes without a newline when auto-execute is disabled", async () => {
		const { launcher, createSession, writeInput } = createHarness();
		await launcher.launchCommand({
			workspaceId: "catalog-ws",
			terminalId: "pane-2",
			command: "codex --help",
			noExecute: true,
		});

		expect(createSession).toHaveBeenCalledTimes(1);
		expect(writeInput).toHaveBeenCalledWith({
			workspaceId: "catalog-ws",
			terminalId: "pane-2",
			data: "codex --help",
		});
	});

	it("writes and kills through the Catalog workspace target", async () => {
		const { launcher, writeInput, killSession } = createHarness();
		await launcher.write({
			workspaceId: "catalog-ws",
			terminalId: "pane-3",
			data: "\u0003",
		});
		await launcher.kill({ workspaceId: "catalog-ws", terminalId: "pane-3" });

		expect(writeInput).toHaveBeenCalledWith({
			workspaceId: "catalog-ws",
			terminalId: "pane-3",
			data: "\u0003",
		});
		expect(killSession).toHaveBeenCalledWith({
			workspaceId: "catalog-ws",
			terminalId: "pane-3",
		});
	});

	it("rejects workspace IDs absent from Catalog", async () => {
		const { launcher } = createHarness();
		expect(
			launcher.create({ workspaceId: "legacy-ws", terminalId: "pane-4" }),
		).rejects.toThrow("not available on the local host service");
	});
});
