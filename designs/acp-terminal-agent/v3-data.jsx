// v3-data.jsx — event script for the interactive prototype
// The App interprets these events over time; between events the pane is idle.
// Content mirrors packages/session-protocol shapes.

const SCENARIO_INITIAL_STATE = {
	session: {
		sessionId: "acp_01HZR3K9Y4M2QPN8SXT9CRWJV1",
		agent: { id: "claude", label: "Claude Code" },
		model: "sonnet-4.5",
		mode: "default",
		protocol: "ACP",
		cwd: "~/Code/superset",
		branch: "feat/acp-agent-control-plane",
		dirty: 9,
		profile: "Balanced",
		pid: 84321,
	},
	timeline: [], // fills in via script
	status: "idle", // idle | running | awaiting_permission
	usage: { used: 12400, size: 200000, cost: 0.02 },
	turnStart: null,
};

// A scripted "trace" of a real ACP turn. Events fire relative to Send-time.
// The App applies events in order using a fake clock; user can also
// short-circuit permission responses via keyboard.
const SCENARIO_SCRIPT = [
	{ at: 0, type: "status", value: "running" },
	{ at: 0, type: "turn_start" },
	{
		at: 400,
		type: "add",
		item: {
			kind: "message",
			role: "thought",
			ts: "now",
			text: "先找一下关闭 pane 的入口逻辑,看看当前是怎么区分 idle / running 的。",
			streaming: true,
		},
	},
	{
		at: 1600,
		type: "add",
		item: {
			kind: "tool",
			toolKind: "search",
			title: 'grep "confirmCloseAcpSession"',
			titleCode: "grep",
			titleTail: '"confirmCloseAcpSession"',
			status: "running",
			body: null,
			footer: null,
		},
	},
	{
		at: 2400,
		type: "update_last_tool",
		patch: {
			status: "completed",
			meta: "✓ 3 matches · 148ms",
			metaClass: "ok",
			body: [
				"V1PanesWorkspace/confirmCloseAcpSession.ts:12",
				"V1PanesWorkspace/useV1PanesWorkspace.tsx:184",
				"V1PanesWorkspace/useV1PanesWorkspace.tsx:210",
			].join("\n"),
			footer: "auto-approved (read-only)",
		},
	},
	{
		at: 2600,
		type: "add",
		item: {
			kind: "tool",
			toolKind: "read",
			title: "Read confirmCloseAcpSession.ts",
			titleCode: "Read",
			titleTail: "confirmCloseAcpSession.ts",
			status: "running",
		},
	},
	{
		at: 3200,
		type: "update_last_tool",
		patch: {
			status: "completed",
			meta: "✓ 52 lines · 1.2 KB · 82ms",
			metaClass: "ok",
		},
	},
	{
		at: 3400,
		type: "add",
		item: {
			kind: "message",
			role: "assistant",
			ts: "now",
			text: '拿到了。我准备把两条 English 提示改成:\n- running: "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?"\n- awaiting_permission: "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?"',
			streaming: true,
		},
	},
	{
		at: 5800,
		type: "add",
		item: {
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
	},
	{
		at: 6200,
		type: "add",
		item: {
			kind: "tool",
			toolKind: "edit",
			title: "Edit confirmCloseAcpSession.ts · L17-L20",
			titleCode: "Edit",
			titleTail: "confirmCloseAcpSession.ts · L17-L20",
			status: "pending_permission",
			meta: "⏸ blocked on permission",
			metaClass: "warn",
			diff: {
				path: "confirmCloseAcpSession.ts",
				stats: { plus: 2, minus: 2 },
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
			},
		},
	},
	{ at: 6300, type: "status", value: "awaiting_permission" },
	{
		at: 6300,
		type: "add",
		item: {
			kind: "permission",
			toolCallId: "edit-1",
			question: (
				<>
					Claude 想编辑 <code>confirmCloseAcpSession.ts</code> —— 2 处替换,+2 −2
					行。
				</>
			),
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
					name: "Allow for session",
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
					name: "Never for session",
					kind: "reject_always",
					keybind: "4",
					hint: "本会话都拒",
				},
			],
		},
	},
];

// Events fired AFTER user resolves the permission (allow branch)
const SCENARIO_AFTER_ALLOW = [
	{ at: 200, type: "resolve_permission", value: "allow" },
	{
		at: 200,
		type: "update_last_tool",
		targetKind: "edit",
		patch: {
			status: "completed",
			meta: "✓ +2 −2 · 62ms",
			metaClass: "ok",
		},
	},
	{ at: 300, type: "status", value: "running" },
	{ at: 400, type: "update_plan_step", index: 1, status: "completed" },
	{ at: 500, type: "update_plan_step", index: 2, status: "in_progress" },
	{
		at: 800,
		type: "add",
		item: {
			kind: "tool",
			toolKind: "read",
			title: "Read v1-panes-workspace.test.ts",
			titleCode: "Read",
			titleTail: "v1-panes-workspace.test.ts",
			status: "running",
		},
	},
	{
		at: 1400,
		type: "update_last_tool",
		patch: {
			status: "completed",
			meta: "✓ 218 lines · 88ms",
			metaClass: "ok",
		},
	},
	{
		at: 1600,
		type: "add",
		item: {
			kind: "message",
			role: "assistant",
			ts: "now",
			text: "找到 3 处涉及关闭提示的用例,准备一并更新以匹配新的中文措辞。",
			streaming: true,
		},
	},
	{ at: 3200, type: "status", value: "idle" },
];

// After reject
const SCENARIO_AFTER_REJECT = [
	{ at: 200, type: "resolve_permission", value: "reject" },
	{
		at: 200,
		type: "update_last_tool",
		targetKind: "edit",
		patch: {
			status: "failed",
			meta: "✗ rejected by user",
			metaClass: "warn",
		},
	},
	{
		at: 400,
		type: "add",
		item: {
			kind: "message",
			role: "assistant",
			ts: "now",
			text: "好的,已放弃这次编辑。要不要我先给出改动预览,你再决定?",
			streaming: true,
		},
	},
	{ at: 1800, type: "status", value: "idle" },
];

// Slash commands (mirrors ACP `AvailableCommand[]`).
// Only include commands the real Claude Code agent typically advertises via
// `available_commands_update` — no aspirational features. When the real
// availableCommands arrives, the pane replaces this seed.
const SLASH_COMMANDS = [
	{ name: "/model", desc: "Switch model", args: "<name>" },
	{ name: "/mode", desc: "Switch mode", args: "<default|plan|accept-edits>" },
	{ name: "/help", desc: "Show available commands" },
	{ name: "/cost", desc: "Show token & cost usage for this turn" },
];

// @ files (mock — usually would come from workspace fs)
const MENTION_FILES = [
	{
		path: "apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/AcpSessionPane/AcpSessionPane.tsx",
		short: "AcpSessionPane.tsx",
		dir: "AcpSessionPane/",
	},
	{
		path: "apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/confirmCloseAcpSession.ts",
		short: "confirmCloseAcpSession.ts",
		dir: "V1PanesWorkspace/",
	},
	{
		path: "apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/useV1PanesWorkspace.tsx",
		short: "useV1PanesWorkspace.tsx",
		dir: "V1PanesWorkspace/",
	},
	{
		path: "packages/session-protocol/src/fold/fold.ts",
		short: "fold.ts",
		dir: "session-protocol/src/fold/",
	},
	{
		path: "packages/host-service/src/runtime/acp-sessions/acp-sessions.ts",
		short: "acp-sessions.ts",
		dir: "acp-sessions/",
	},
];

// Initial user prompt seed (pre-filled in composer on load so demo is one click away)
const INITIAL_USER_PROMPT =
	"把 ACP session pane 关闭时的确认提示改成中文,并且区分 running 和 awaiting_permission 两种状态的措辞。";

Object.assign(window, {
	SCENARIO_INITIAL_STATE,
	SCENARIO_SCRIPT,
	SCENARIO_AFTER_ALLOW,
	SCENARIO_AFTER_REJECT,
	SLASH_COMMANDS,
	MENTION_FILES,
	INITIAL_USER_PROMPT,
});
