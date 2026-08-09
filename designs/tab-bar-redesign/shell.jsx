// Full-window app shell — renders sidebar + agent row + tab bar slot + chat +
// files panel + terminal dock, in Dracula colors, matching what the user sees
// in the running desktop app.

// ---- Icons -----------------------------------------------------------------

const Icon = {
	Close: () => (
		<svg viewBox="0 0 12 12" fill="none">
			<path
				d="M2.5 2.5l7 7M9.5 2.5l-7 7"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
		</svg>
	),
	Plus: () => (
		<svg viewBox="0 0 12 12" fill="none">
			<path
				d="M6 2v8M2 6h8"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	),
	Gear: () => (
		<svg viewBox="0 0 12 12" fill="none">
			<circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
			<path
				d="M6 1.5v1.2M6 9.3v1.2M10.5 6H9.3M2.7 6H1.5M9.2 2.8l-.85.85M3.65 8.35l-.85.85M9.2 9.2l-.85-.85M3.65 3.65l-.85-.85"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
			/>
		</svg>
	),
	Play: () => (
		<svg viewBox="0 0 10 10" fill="currentColor">
			<path d="M2.5 1.5v7l6-3.5z" />
		</svg>
	),
	Chevron: () => (
		<svg viewBox="0 0 10 10" fill="none">
			<path
				d="M3 3.5l2 3 2-3"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	),
	Terminal: () => (
		<svg viewBox="0 0 14 14" fill="none">
			<rect
				x="1.5"
				y="2.5"
				width="11"
				height="9"
				rx="1"
				stroke="currentColor"
				strokeWidth="1"
			/>
			<path
				d="M4 6l1.5 1.5L4 9"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7 9h3"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
			/>
		</svg>
	),
	Files: () => (
		<svg viewBox="0 0 14 14" fill="none">
			<path
				d="M3 1.5h5l3 3V12a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z"
				stroke="currentColor"
				strokeWidth="1"
			/>
			<path d="M8 1.5v3.5h3" stroke="currentColor" strokeWidth="1" />
		</svg>
	),
	GitBranch: () => (
		<svg viewBox="0 0 14 14" fill="none">
			<circle cx="3.5" cy="3.5" r="1.3" stroke="currentColor" strokeWidth="1" />
			<circle
				cx="3.5"
				cy="10.5"
				r="1.3"
				stroke="currentColor"
				strokeWidth="1"
			/>
			<circle cx="10.5" cy="4" r="1.3" stroke="currentColor" strokeWidth="1" />
			<path
				d="M3.5 4.8v4.4M4.8 3.5c3 0 4.4 1.5 4.4 4"
				stroke="currentColor"
				strokeWidth="1"
			/>
		</svg>
	),
	ClaudeStar: ({ color = "var(--pink)" }) => (
		<svg viewBox="0 0 16 16" fill="none">
			<path
				d="M8 2c.3 0 .5.2.6.5l.9 3 3 .9c.3.1.5.3.5.6s-.2.5-.5.6l-3 .9-.9 3c-.1.3-.3.5-.6.5s-.5-.2-.6-.5l-.9-3-3-.9C3.2 7.5 3 7.3 3 7s.2-.5.5-.6l3-.9.9-3c.1-.3.3-.5.6-.5z"
				fill={color}
			/>
		</svg>
	),
	CodexRing: () => (
		<svg viewBox="0 0 16 16" fill="none">
			<circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" />
			<circle cx="8" cy="8" r="1.2" fill="currentColor" />
		</svg>
	),
};

// ---- Data (mirrors the user's real screenshot) -----------------------------

const DEMO_TABS = [
	{ id: "t1", title: "Terminal", icon: "terminal" },
	{ id: "t2", title: "你能干嘛呢", icon: "claude", running: true },
	{ id: "t3", title: "Claude", icon: "claude" },
	{ id: "t4", title: "Codex", icon: "codex" },
];
const DEFAULT_ACTIVE = "t2";

function TabIcon({ kind }) {
	if (kind === "claude") return <Icon.ClaudeStar color="currentColor" />;
	if (kind === "codex") return <Icon.CodexRing />;
	if (kind === "terminal") return <Icon.Terminal />;
	return null;
}

// ---- Shared UI blocks ------------------------------------------------------

function Sidebar() {
	return (
		<aside className="sidebar">
			<div className="sb-group">Workspaces</div>
			<div className="sb-item">
				<span className="dot" />
				<span className="sb-name">superset · main</span>
			</div>
			<div className="sb-item running">
				<span className="dot" />
				<span className="sb-name">acp-demo-smoke</span>
			</div>
			<div className="sb-item active">
				<span className="dot" />
				<span className="sb-name">acp-agent-control-plane</span>
			</div>
			<div className="sb-item">
				<span className="dot" />
				<span className="sb-name">chat-composer-max</span>
			</div>
			<div className="sb-item">
				<span className="dot" />
				<span className="sb-name">tab-bar-redesign</span>
			</div>
			<div className="sb-group">Recent</div>
			<div className="sb-item">
				<span className="dot" />
				<span className="sb-name">2608 · font-settings</span>
			</div>
			<div className="sb-item">
				<span className="dot" />
				<span className="sb-name">v03-plan-lane</span>
			</div>
		</aside>
	);
}

function AgentRow() {
	return (
		<div className="agent-row no-drag">
			<span className="agent-chip">
				<Icon.ClaudeStar />
				<span>claude</span>
			</span>
			<span className="agent-chip">
				<Icon.CodexRing />
				<span>codex</span>
			</span>
			<span className="agent-chip">
				<span className="agent-emoji">Ⓟ</span>
				<span>pi</span>
			</span>
			<span className="agent-chip">
				<span className="agent-emoji">🎬</span>
				<span>MyFlicker</span>
			</span>
			<span className="agent-icon-plus">
				<Icon.Plus />
			</span>
			<span className="agent-icon-gear">
				<Icon.Gear />
			</span>
			<span className="spacer" />
			<span className="agent-chip" style={{ fontFamily: "var(--font-mono)" }}>
				<Icon.GitBranch />
			</span>
			<span className="set-run">
				<Icon.Play />
				<span>Set Run</span>
				<span className="set-run-chevron">
					<Icon.Chevron />
				</span>
			</span>
		</div>
	);
}

function ChatBody() {
	return (
		<div className="chat">
			<div className="chat-header">
				<span className="chat-chip">Claude</span>
				<span className="chat-title">你能干嘛呢</span>
			</div>
			<div className="chat-row you">
				<span className="chat-role">YOU</span>
				<div className="chat-bubble">你好</div>
			</div>
			<div className="chat-row assistant">
				<span className="chat-role">CLAUDE</span>
				<div className="chat-body">你好!有什么我可以帮你的吗?</div>
			</div>
			<div className="chat-row you">
				<span className="chat-role">YOU</span>
				<div className="chat-bubble">你能干嘛呢</div>
			</div>
			<div className="chat-row assistant">
				<span className="chat-role">CLAUDE</span>
				<div className="chat-body">
					我是 Kiro,可以帮你处理这个 Superset monorepo 里的各种开发任务:
					<ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
						<li>
							<strong>写代码和改代码</strong> — 新功能、修 bug、重构、类型修复
						</li>
						<li>
							<strong>探索代码库</strong> — 查找定义、追踪引用、理解模块关系
						</li>
						<li>
							<strong>运行命令</strong> — 测试、lint、typecheck、构建、启动 dev
							server
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
}

function FilesPane() {
	return (
		<aside className="files-pane">
			<div className="files-tabs">
				<span className="files-tab">
					<Icon.GitBranch /> Changes
				</span>
				<span className="files-tab active">
					<Icon.Files /> Files
				</span>
			</div>
			<div className="files-search">搜索文件...</div>
			<div className="files-icons">
				<Icon.Plus />
				<Icon.Files />
			</div>
			<div className="files-list">
				<div className="files-item">
					apps/desktop/src/renderer/globals.css{" "}
					<span className="diff mod">M</span>
				</div>
				<div className="files-item">
					packages/panes/.../TabBar.tsx <span className="diff mod">M</span>
				</div>
				<div className="files-item">
					packages/panes/.../TabItem.tsx <span className="diff mod">M</span>
				</div>
				<div className="files-item">
					designs/tab-bar-redesign/ <span className="diff">+</span>
				</div>
			</div>
		</aside>
	);
}

function _TerminalDock() {
	return (
		<div className="dock">
			<div className="dock-body">
				<div className="prompt">
					wufan in <span className="branch">superset</span> on{" "}
					<span className="branch">feat/acp-agent-control-plane</span>
				</div>
				<div>
					<span className="prompt">›</span> <span>bun run dev</span>
					<span className="caret" />
				</div>
			</div>
		</div>
	);
}

function Titlebar() {
	return (
		<div className="titlebar drag">
			<div className="traffic">
				<span />
				<span />
				<span />
			</div>
			<span className="titlebar-title">
				Superset (local-dev) · feat/acp-agent-control-plane
			</span>
			<span className="titlebar-branch">
				<Icon.GitBranch /> feat/acp-agent-control-plane
			</span>
			<span className="titlebar-org">
				<Icon.ClaudeStar color="var(--muted)" /> Local Admin's
			</span>
		</div>
	);
}

/**
 * AppShell — renders the full app frame with a slot for the tab bar at the
 * top of the main column. Pass the tab bar as children.
 */
function AppShell({ children }) {
	return (
		<div className="window window--with-dock">
			<Titlebar />
			<Sidebar />
			<div className="main">
				{children}
				<AgentRow />
				<ChatBody />
			</div>
			<div className="dock">
				<div className="dock-body">
					<div className="prompt">
						wufan in <span className="cwd">superset</span> on{" "}
						<span className="branch">feat/acp-agent-control-plane</span>
					</div>
					<div>
						<span className="prompt">›</span> bun run dev
						<span className="caret" />
					</div>
				</div>
			</div>
			<FilesPane />
		</div>
	);
}

Object.assign(window, {
	Icon,
	DEMO_TABS,
	DEFAULT_ACTIVE,
	TabIcon,
	AppShell,
});
