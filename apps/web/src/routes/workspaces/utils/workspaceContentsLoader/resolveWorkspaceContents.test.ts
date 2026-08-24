import { expect, test } from "bun:test";
import { resolveWorkspaceContents } from "./resolveWorkspaceContents";

const acp = Promise.resolve({
	enabled: true,
	items: [
		{
			sessionId: "acp-1",
			title: "Chat",
			status: "idle",
			updatedAt: 10,
		},
	],
});

const terminalAgents = Promise.resolve([
	{
		terminalId: "terminal-1",
		agentId: "codex",
		lastEventAt: 30,
		lastEventType: "Start",
	},
]);

test("keeps healthy workspace sources when one phone tab source fails", async () => {
	const result = await resolveWorkspaceContents({
		acp,
		terminalSessions: Promise.reject(new Error("terminal unavailable")),
		terminalAgents,
	});

	expect(result.contents.sessions).toHaveLength(1);
	expect(result.contents.terminalAgents).toHaveLength(1);
	expect(result.contents.terminalSessions).toEqual([]);
	expect(result.warnings).toEqual([
		"Terminal tabs are temporarily unavailable.",
	]);
});

test("fails the workspace load only when every source fails", async () => {
	await expect(
		resolveWorkspaceContents({
			acp: Promise.reject(new Error("acp unavailable")),
			terminalSessions: Promise.reject(new Error("terminal unavailable")),
			terminalAgents: Promise.reject(new Error("agents unavailable")),
		}),
	).rejects.toThrow("acp unavailable");
});
