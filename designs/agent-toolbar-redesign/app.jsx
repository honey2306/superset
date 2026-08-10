// Agent toolbar redesign — three variants shown inside the full app shell
// so you can judge fit-in-context. All in one file to sidestep babel-standalone
// multi-file loading quirks.

// ---- Icons (inline) --------------------------------------------------------

const Icon = {
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
		<svg viewBox="0 0 14 14" fill="none">
			<circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.1" />
			<path
				d="M7 1.5v1.5M7 11v1.5M12.5 7H11M3 7H1.5M10.9 3.1l-1 1M4.1 9.9l-1 1M10.9 10.9l-1-1M4.1 4.1l-1-1"
				stroke="currentColor"
				strokeWidth="1.1"
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
				d="M3 3.8l2 2.4 2-2.4"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	),
	Bot: () => (
		<svg viewBox="0 0 14 14" fill="none">
			<rect
				x="2"
				y="4"
				width="10"
				height="8"
				rx="1.5"
				stroke="currentColor"
				strokeWidth="1.1"
			/>
			<circle cx="5" cy="8" r="0.9" fill="currentColor" />
			<circle cx="9" cy="8" r="0.9" fill="currentColor" />
			<path
				d="M7 2v2M4.5 4h5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
		</svg>
	),
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

// ---- Fake data — matches the real screenshot -------------------------------

const AGENTS = [
	{
		id: "claude",
		label: "claude",
		icon: <Icon.ClaudeStar color="var(--pink)" />,
	},
	{ id: "codex", label: "codex", icon: <Icon.CodexRing /> },
	{
		id: "pi",
		label: "pi",
		icon: (
			<span
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: 11,
					color: "var(--purple)",
				}}
			>
				Pi
			</span>
		),
	},
	{
		id: "myflicker",
		label: "MyFlicker",
		icon: (
			<span
				style={{
					fontSize: 12,
				}}
			>
				🎬
			</span>
		),
	},
];

const DEMO_TABS = [
	{ id: "t1", title: "Terminal", icon: "terminal" },
	{
		id: "t2",
		title: "你能干嘛呢",
		icon: "claude",
		running: true,
		active: true,
	},
	{ id: "t3", title: "Claude", icon: "claude" },
	{ id: "t4", title: "Codex", icon: "codex" },
];

function TabIcon({ kind }) {
	if (kind === "claude") return <Icon.ClaudeStar color="currentColor" />;
	if (kind === "codex") return <Icon.CodexRing />;
	if (kind === "terminal") return <Icon.Terminal />;
	return null;
}

// ---- Shared shell pieces ---------------------------------------------------

function Titlebar() {
	return (
		<div className="titlebar">
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
		</div>
	);
}

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
		</aside>
	);
}

function TabBar() {
	return (
		<div className="tabbar">
			<div className="tabs-track">
				{DEMO_TABS.map((t) => (
					<div className="tab-slot" key={t.id}>
						<div
							className={["tab", t.active && "active", t.running && "running"]
								.filter(Boolean)
								.join(" ")}
						>
							<span className="tab-icon">
								<TabIcon kind={t.icon} />
							</span>
							{t.running && <span className="tab-dot" />}
							<span className="tab-title">{t.title}</span>
						</div>
					</div>
				))}
			</div>
			<span className="tab-add">
				<Icon.Plus />
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
						<li>写代码和改代码 — 新功能、修 bug、重构、类型修复</li>
						<li>探索代码库 — 查找定义、追踪引用、理解模块关系</li>
						<li>运行命令 — 测试、lint、typecheck、构建</li>
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
			<div className="files-list">
				<div className="files-item">
					apps/desktop/.../globals.css <span className="diff mod">M</span>
				</div>
				<div className="files-item">
					packages/panes/.../TabBar.tsx <span className="diff mod">M</span>
				</div>
				<div className="files-item">
					designs/agent-toolbar-redesign/ <span className="diff">+</span>
				</div>
			</div>
		</aside>
	);
}

function TerminalDock() {
	return (
		<div className="dock">
			<div>
				wufan in <span className="cwd">superset</span> on{" "}
				<span className="branch">feat/acp-agent-control-plane</span>
			</div>
			<div>
				› bun run dev
				<span className="caret" />
			</div>
		</div>
	);
}

// ---- The three toolbar variants --------------------------------------------

function ToolbarA_Divided() {
	return (
		<div className="toolbar a-divided">
			<div className="tb-group">
				{AGENTS.map((a) => (
					<span className="tb-chip" key={a.id}>
						<span className="tb-chip-icon">{a.icon}</span>
						<span>{a.label}</span>
					</span>
				))}
			</div>
			<div className="tb-group">
				<span className="tb-icon-btn" title="Add agent preset">
					<Icon.Plus />
				</span>
				<span className="tb-icon-btn" title="Manage presets">
					<Icon.Gear />
				</span>
			</div>
			<div className="tb-spacer" />
			<div className="tb-group">
				<span className="tb-icon-btn" title="Agent sessions">
					<Icon.Bot />
				</span>
			</div>
			<div className="tb-group">
				<span className="run-split">
					<span className="run-main">
						<Icon.Play />
						<span>Set Run</span>
					</span>
					<span className="run-chevron">
						<Icon.Chevron />
					</span>
				</span>
			</div>
		</div>
	);
}

function ToolbarB_Grouped() {
	return (
		<div className="toolbar b-grouped">
			<div className="tb-pack">
				{AGENTS.map((a) => (
					<span className="tb-chip" key={a.id}>
						<span className="tb-chip-icon">{a.icon}</span>
						<span>{a.label}</span>
					</span>
				))}
				<span className="tb-icon-btn" title="Add agent preset">
					<Icon.Plus />
				</span>
				<span className="tb-icon-btn" title="Manage presets">
					<Icon.Gear />
				</span>
			</div>
			<div className="tb-spacer" />
			<div className="tb-pack">
				<span className="tb-icon-btn" title="Agent sessions">
					<Icon.Bot />
				</span>
				<span className="run-split">
					<span className="run-main">
						<Icon.Play />
						<span>Set Run</span>
					</span>
					<span className="run-chevron">
						<Icon.Chevron />
					</span>
				</span>
			</div>
		</div>
	);
}

function ToolbarC_Ambient() {
	return (
		<div className="toolbar c-ambient">
			{AGENTS.map((a, i) => (
				<span className={`tb-chip${i === 0 ? " active" : ""}`} key={a.id}>
					<span className="tb-chip-icon">{a.icon}</span>
					<span>{a.label}</span>
				</span>
			))}
			<span className="tb-icon-btn" title="Add agent preset">
				<Icon.Plus />
			</span>
			<span className="tb-icon-btn" title="Manage presets">
				<Icon.Gear />
			</span>
			<div className="tb-spacer" />
			<span className="tb-icon-btn" title="Agent sessions">
				<Icon.Bot />
			</span>
			<span className="run-split">
				<span className="run-main">
					<Icon.Play />
					<span>Set Run</span>
				</span>
				<span className="run-chevron">
					<Icon.Chevron />
				</span>
			</span>
		</div>
	);
}

// ---- Shell wrapper + page --------------------------------------------------

function AppShell({ toolbar }) {
	return (
		<div className="window">
			<Titlebar />
			<Sidebar />
			<div className="main">
				<TabBar />
				{toolbar}
				<ChatBody />
			</div>
			<TerminalDock />
			<FilesPane />
		</div>
	);
}

function VariantBlock({ badge, title, desc, children }) {
	return (
		<section className="variant-section">
			<div>
				<span className="variant-badge">{badge}</span>
				<span className="variant-title">{title}</span>
			</div>
			<AppShell toolbar={children} />
			<p className="variant-caption">{desc}</p>
		</section>
	);
}

function App() {
	return (
		<div className="page">
			<header>
				<h1 className="page-title">Agent Toolbar Redesign · 完整环境对比</h1>
				<p className="page-lede">
					Tab 栏刚定为 flat + underline 语言,agent toolbar 也应对齐:不要 border
					pill、不要 shadow、不要多余色块。三版都在完整 app 环境里, 可以直接看和
					tab 栏、chat 区、Files 面板的搭配。
				</p>
			</header>

			<VariantBlock
				badge="A"
				title="Divided · hairline 分组"
				desc="沿用 tab 栏刚定的 hairline 分隔语言:chip 之间用极细竖线,逻辑组(agent chips | + gear | Bot | Run)之间用稍宽的分隔加短竖线。Set Run 去掉 border pill,变成 pink underline 高亮(和 tab active 完全同款)。整条 toolbar 读成一整体,但结构清楚。"
			>
				<ToolbarA_Divided />
			</VariantBlock>

			<VariantBlock
				badge="B"
				title="Grouped · 两簇 pill 容器"
				desc="左侧 agent chips + 加号 + 齿轮 套进一个极淡的 rounded 容器,右侧 Bot + Set Run 套进另一个。整条 toolbar 一眼分成两组,视觉重心平衡。Set Run 沿用 split 结构但去掉 border,靠容器 pill 提供边界。"
			>
				<ToolbarB_Grouped />
			</VariantBlock>

			<VariantBlock
				badge="C"
				title="Ambient · 极简 + 当前 agent underline"
				desc="全部 ghost,generous gap,chip 靠 hover 显形。当前选中的 agent(claude)加 pink underline —— 和 tab active 用一套语言,直接告诉你在跟谁说话。Set Run 保留深色 outline,play 图标用 pink 点睛。视觉最安静,但需要习惯当前 agent 靠底部一根线定位这种模式。"
			>
				<ToolbarC_Ambient />
			</VariantBlock>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
