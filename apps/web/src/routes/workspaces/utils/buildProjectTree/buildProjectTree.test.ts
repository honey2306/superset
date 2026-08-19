import { expect, test } from "bun:test";
import { buildProjectTree } from "./buildProjectTree";

test("combines ACP sessions and terminal agents beneath their real workspace", () => {
	const tree = buildProjectTree({
		projects: [{ id: "project-1", name: "Superset", repoPath: "/repo" }],
		workspaces: [
			{
				id: "workspace-1",
				projectId: "project-1",
				name: "main",
				branch: "main",
			},
		],
		contentsByWorkspaceId: new Map([
			[
				"workspace-1",
				{
					acpEnabled: true,
					sessions: [
						{
							sessionId: "acp-1",
							title: "Relay work",
							status: "running",
							updatedAt: 20,
						},
					],
					terminalSessions: [],
					terminalAgents: [
						{
							terminalId: "terminal-1",
							agentId: "codex",
							lastEventAt: 30,
							lastEventType: "Start",
						},
					],
				},
			],
		]),
		agentLabel: (agentId) => `Agent ${agentId}`,
	});

	expect(tree[0]?.workspaces[0]?.leaves).toEqual([
		{
			kind: "terminal",
			id: "terminal-1",
			title: "Agent codex",
			updatedAt: 30,
			running: true,
		},
		{
			kind: "acp",
			id: "acp-1",
			title: "Relay work",
			updatedAt: 20,
			running: true,
		},
	]);
});

test("renders ordinary terminal sessions without an agent binding", () => {
	const tree = buildProjectTree({
		projects: [{ id: "project-1", name: "Superset", repoPath: "/repo" }],
		workspaces: [
			{
				id: "workspace-1",
				projectId: "project-1",
				name: "main",
				branch: "main",
			},
		],
		contentsByWorkspaceId: new Map([
			[
				"workspace-1",
				{
					acpEnabled: false,
					terminalSessions: [
						{
							terminalId: "terminal-1",
							createdAt: 40,
							exited: false,
							title: "Shell",
						},
					],
					terminalAgents: [],
				},
			],
		]),
		agentLabel: (agentId) => `Agent ${agentId}`,
	});

	expect(tree[0]?.workspaces[0]?.leaves).toEqual([
		{
			kind: "terminal",
			id: "terminal-1",
			title: "Shell",
			updatedAt: 40,
			running: true,
		},
	]);
});

test("enriches a bound terminal without duplicating its session", () => {
	const tree = buildProjectTree({
		projects: [{ id: "project-1", name: "Superset", repoPath: "/repo" }],
		workspaces: [
			{
				id: "workspace-1",
				projectId: "project-1",
				name: "main",
				branch: "main",
			},
		],
		contentsByWorkspaceId: new Map([
			[
				"workspace-1",
				{
					acpEnabled: false,
					terminalSessions: [
						{
							terminalId: "terminal-1",
							createdAt: 10,
							exited: false,
							title: "Shell",
						},
					],
					terminalAgents: [
						{
							terminalId: "terminal-1",
							agentId: "codex",
							lastEventAt: 50,
							lastEventType: "Start",
						},
					],
				},
			],
		]),
		agentLabel: (agentId) => `Agent ${agentId}`,
	});

	expect(tree[0]?.workspaces[0]?.leaves).toEqual([
		{
			kind: "terminal",
			id: "terminal-1",
			title: "Agent codex",
			updatedAt: 50,
			running: true,
		},
	]);
});

test("hides ACP leaves when the host has ACP disabled without hiding terminals", () => {
	const tree = buildProjectTree({
		projects: [{ id: "project-1", name: null, repoPath: "/repo" }],
		workspaces: [
			{
				id: "workspace-1",
				projectId: "project-1",
				name: null,
				branch: "feature/mobile",
			},
		],
		contentsByWorkspaceId: new Map([
			[
				"workspace-1",
				{
					acpEnabled: false,
					sessions: [
						{
							sessionId: "hidden-acp",
							status: "running",
							updatedAt: 10,
						},
					],
					terminalSessions: [],
					terminalAgents: [
						{
							terminalId: "terminal-1",
							agentId: "claude",
							lastEventAt: 11,
							lastEventType: "Stop",
						},
					],
				},
			],
		]),
		agentLabel: (agentId) => agentId,
	});

	expect(tree[0]?.title).toBe("/repo");
	expect(tree[0]?.workspaces[0]?.leaves).toEqual([
		{
			kind: "terminal",
			id: "terminal-1",
			title: "claude",
			updatedAt: 11,
			running: false,
		},
	]);
});

test("treats a legacy snapshot without project arrays as an empty tree", () => {
	expect(
		buildProjectTree({
			contentsByWorkspaceId: new Map(),
			agentLabel: (agentId) => agentId,
		}),
	).toEqual([]);
});
