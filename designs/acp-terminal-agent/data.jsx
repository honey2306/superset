// data.jsx — mock ACP session state used by all 4 variants
// Structured to match packages/session-protocol's TimelineItem/ContentBlock shape

const MOCK_SESSION = {
	sessionId: "acp_01HZR3K9Y4M2QPN8SXT9CRWJV1",
	cwd: "~/Code/superset",
	branch: "feat/acp-agent-control-plane",
	gitDirty: 9,
	agentId: "claude",
	agentLabel: "Claude Code",
	protocol: "ACP",
	model: "Sonnet 4.5",
	mode: "default",
	profile: "Balanced",
	status: "awaiting_permission",
	connection: "streaming",
	usage: { used: 62800, size: 200000, cost: 0.14 },
	turnStart: "14:32:07",
	turnElapsed: "38s",
};

const MOCK_TIMELINE = [
	{
		id: "m1",
		kind: "message",
		role: "user",
		ts: "14:32:07",
		blocks: [
			{
				type: "text",
				text: "把 ACP session pane 关闭时的确认提示改成中文,并且区分 running 和 awaiting_permission 两种状态的措辞。",
			},
		],
	},
	{
		id: "m2",
		kind: "message",
		role: "thought",
		ts: "14:32:09",
		blocks: [
			{
				type: "text",
				text: "先找一下关闭 pane 的入口逻辑,看看当前是怎么区分 idle / running 的。",
			},
		],
	},
	{
		id: "t1",
		kind: "tool_call",
		toolKind: "search",
		title: "Grep",
		args: "confirmCloseAcpSession",
		status: "completed",
		locations: [
			{
				path: "apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/",
			},
		],
		output: "3 matches in 2 files",
		outputLines: [
			"V1PanesWorkspace/confirmCloseAcpSession.ts:12",
			"V1PanesWorkspace/useV1PanesWorkspace.tsx:184",
			"V1PanesWorkspace/useV1PanesWorkspace.tsx:210",
		],
	},
	{
		id: "t2",
		kind: "tool_call",
		toolKind: "read",
		title: "Read",
		args: "confirmCloseAcpSession.ts",
		status: "completed",
		locations: [
			{ path: "V1PanesWorkspace/confirmCloseAcpSession.ts", line: 1 },
		],
		output: "52 lines",
	},
	{
		id: "m3",
		kind: "message",
		role: "agent",
		ts: "14:32:24",
		blocks: [
			{
				type: "text",
				text: '拿到了。我准备把两条 English 提示改成:\n- running: "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?"\n- awaiting_permission: "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?"',
			},
		],
	},
	{
		id: "p1",
		kind: "plan",
		entries: [
			{
				content: "定位所有关闭 pane 的确认入口",
				priority: "high",
				status: "completed",
			},
			{
				content: "改写英文提示为中文,区分 running / awaiting",
				priority: "high",
				status: "in_progress",
			},
			{
				content: "更新对应 pane 测试用例",
				priority: "medium",
				status: "pending",
			},
			{ content: "跑 typecheck + lint", priority: "low", status: "pending" },
		],
	},
	{
		id: "t3",
		kind: "tool_call",
		toolKind: "edit",
		title: "Edit",
		args: "confirmCloseAcpSession.ts",
		status: "pending_permission",
		locations: [
			{ path: "V1PanesWorkspace/confirmCloseAcpSession.ts", line: 18 },
		],
		diff: {
			path: "confirmCloseAcpSession.ts",
			hunk: [
				{ type: "ctx", ln: 16, txt: '  if (status === "running") {' },
				{
					type: "del",
					ln: 17,
					txt: '    return "Agent is running. Closing will cancel the current turn. Close anyway?";',
				},
				{
					type: "add",
					ln: 17,
					txt: '    return "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?";',
				},
				{ type: "ctx", ln: 18, txt: "  }" },
				{
					type: "ctx",
					ln: 19,
					txt: '  if (status === "awaiting_permission") {',
				},
				{
					type: "del",
					ln: 20,
					txt: '    return "Agent is awaiting your approval. Close?";',
				},
				{
					type: "add",
					ln: 20,
					txt: '    return "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?";',
				},
				{ type: "ctx", ln: 21, txt: "  }" },
			],
			stats: { plus: 2, minus: 2 },
		},
	},
	{
		id: "perm1",
		kind: "permission",
		toolCallId: "t3",
		question: "允许 Claude 编辑 confirmCloseAcpSession.ts?",
		options: [
			{
				optionId: "allow_once",
				name: "Allow once",
				kind: "allow_once",
				keybind: "1",
				hint: "本次",
			},
			{
				optionId: "allow_always",
				name: "Allow for this session",
				kind: "allow_always",
				keybind: "2",
				hint: "本会话",
			},
			{
				optionId: "reject_once",
				name: "Reject once",
				kind: "reject_once",
				keybind: "3",
				hint: "本次拒绝",
			},
			{
				optionId: "reject_always",
				name: "Never for this session",
				kind: "reject_always",
				keybind: "4",
				hint: "本会话都拒",
			},
		],
	},
];

// Available slash commands (from AvailableCommand[])
const MOCK_COMMANDS = [
	{ name: "/model", desc: "切换模型" },
	{ name: "/mode", desc: "切换 mode (default / plan / accept-edits)" },
	{ name: "/agent", desc: "切换 Agent Runtime Profile" },
	{ name: "/clear", desc: "开始新会话保留 workspace" },
	{ name: "/resume", desc: "恢复历史会话" },
	{ name: "/cost", desc: "查看本次 turn 的 token 与费用" },
];

// Recent sessions (for menu preview in V2/V4)
const MOCK_RECENT = [
	{
		title: "改中文关闭提示",
		status: "awaiting_permission",
		updatedAt: "刚刚",
		model: "sonnet",
	},
	{
		title: "补写 acpSessions.integration.test.ts",
		status: "running",
		updatedAt: "2m",
		model: "sonnet",
	},
	{
		title: "调查 pane remount 时 create 重复问题",
		status: "idle",
		updatedAt: "18m",
		model: "opus",
	},
	{
		title: "梳理 host-service restart 恢复语义",
		status: "offline",
		updatedAt: "1h",
		model: "sonnet",
	},
];

Object.assign(window, {
	MOCK_SESSION,
	MOCK_TIMELINE,
	MOCK_COMMANDS,
	MOCK_RECENT,
});
