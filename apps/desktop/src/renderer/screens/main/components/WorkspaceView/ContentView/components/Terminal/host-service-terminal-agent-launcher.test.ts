import { describe, expect, it, mock } from "bun:test";
import { launchTerminalAgent } from "./host-service-terminal-agent-launcher";

function createMockClient() {
	const run = mock(async (input: { terminalId?: string }) => ({
		kind: "terminal" as const,
		sessionId: input.terminalId ?? "unexpected",
		label: "Codex",
	}));
	return {
		client: { agents: { run: { mutate: run } } },
		run,
	};
}

describe("host-service-terminal-agent-launcher (Milestone 4)", () => {
	it("launches through the formal host agent router", async () => {
		const { client, run } = createMockClient();

		const result = await launchTerminalAgent({
			client: client as never,
			workspaceId: "ws-1",
			paneId: "pane-agent-1",
			agent: "codex",
			prompt: "Hello",
			model: "gpt-5",
		});

		expect(result.terminalId).toBe("pane-agent-1");
		expect(result.label).toBe("Codex");
		expect(run).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			agent: "codex",
			prompt: "Hello",
			terminalId: "pane-agent-1",
			model: "gpt-5",
			effort: undefined,
		});
	});

	it("rejects a non-terminal launch result", async () => {
		const run = mock(async () => ({
			kind: "acp" as const,
			sessionId: "acp-1",
			label: "Claude",
		}));

		expect(
			launchTerminalAgent({
				client: { agents: { run: { mutate: run } } } as never,
				workspaceId: "ws-1",
				paneId: "pane-agent-2",
				agent: "claude",
				prompt: "",
			}),
		).rejects.toThrow("did not launch in a terminal");
	});
});
