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
// The three tab-bar variants. Same TabItem markup; only the outer bar class
// changes to swap in a different variant.css block.

function TabBar({ variant, tabs, activeId, onSelect }) {
	return (
		<div className={`tabbar ${variant}`}>
			<div className="tabs-track">
				{tabs.map((t) => {
					const active = t.id === activeId;
					const running = !!t.running;
					const cls = ["tab", active && "active", running && "running"]
						.filter(Boolean)
						.join(" ");
					return (
						<div key={t.id} className={cls} onClick={() => onSelect(t.id)}>
							<span className="tab-icon">
								<TabIcon kind={t.icon} />
							</span>
							{running && <span className="tab-dot" />}
							<span className="tab-title">{t.title}</span>
							<span className="tab-close">
								<Icon.Close />
							</span>
						</div>
					);
				})}
			</div>
			<span className="tab-add">
				<Icon.Plus />
			</span>
		</div>
	);
}

Object.assign(window, { TabBar });
// Top-level page — three full app frames stacked, each with a different
// tab-bar variant so you can judge fit-in-context, not just the bar alone.

function VariantBlock({ badge, title, desc, variant }) {
	const [active, setActive] = React.useState(DEFAULT_ACTIVE);
	return (
		<section className="variant-section">
			<div>
				<span className="variant-badge">{badge}</span>
				<span className="variant-title">{title}</span>
			</div>
			<AppShell>
				<TabBar
					variant={variant}
					tabs={DEMO_TABS}
					activeId={active}
					onSelect={setActive}
				/>
			</AppShell>
			<p className="variant-caption">{desc}</p>
		</section>
	);
}

function App() {
	return (
		<div className="page">
			<header>
				<h1 className="page-title">Tab Bar Redesign · 完整环境对比</h1>
				<p className="page-lede">
					上一轮的设计单独看还行,放到整个 app 里立刻不搭 — 因为 Superset 现在
					整体是极端 flat 的语言(没有 elevation、没有阴影、圆角很少,pink
					只在文字段头和小 chip outline 上用)。这轮三版都对齐这个语言: 没有
					pill、没有 shadow、没有 highlight border,只用最轻的方式区分
					激活态。tab bar 里点击可切换 active tab。
				</p>
			</header>

			<VariantBlock
				badge="A"
				title="Underline · 底部一根 pink 细线"
				variant="a-underline"
				desc="和你右侧 Changes/Files 面板完全同款的语言:tab 完全平,active 只在底部有一根 pink underline。零改动风险,融入度最高;唯一缺点是当 tab 数量多时,靠一根短线定位当前 tab 需要眼睛扫一下底边。"
			/>

			<VariantBlock
				badge="B"
				title="Ghost fill · dim 底色 + 短 hairline"
				variant="b-ghost"
				desc="Active tab 有一层 dim 底色(--panel,和 sidebar active item 同一色阶),再配一条 pink underline。非激活 tab 之间用极淡的 hairline 隔开(active/hover 两侧自动隐藏)。层级感比 A 强一点,但依然完全 flat,没有 border 或 shadow。个人觉得视觉噪音和识别度之间平衡最好。"
			/>

			<VariantBlock
				badge="C"
				title="Left tick · 左侧 pink 竖标记(和 sidebar 同款)"
				variant="c-tick"
				desc="Active tab 左边加一根 2px pink 竖标记 —— 这就是左侧 sidebar 里 active workspace item 的语言,直接复用。tab 本身有极淡的 pink tint 底色(5%)。视觉上和整个 app 最一致(sidebar + tab bar 共用一套 active 语言),但要看你能否接受 active 靠左侧一个竖线定位这种阅读习惯。"
			/>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
