// Arc Spaces 风侧边栏 — 单一版本,克制到极致
// 假设:1 项目 = 1 (偶尔多) workspace
// - 项目切换 → 底部 dock 的圆点(Arc 的 Spaces bar)
// - 主列 = 当前项目的 "Now"(正在跑的 workspace) + Pinned + Recent
// - 整个侧栏被当前项目的色调轻微染色 (--tint HSL),而不是硬色块

// Arc-style HSL tint per project (色调,不是硬色)
// glyph = 用户 emoji / 品牌短记号 (2 字符也允许);favicon = GitHub org favicon 拉过来
const PROJECT_TINTS = {
	superset: {
		tint: "320 70% 60%",
		initial: "S",
		glyph: "🧬",
		favicon: "https://github.com/wufan17.png?size=64",
		bg: "linear-gradient(135deg, #ff79c6, #bd93f9)",
	},
	"acme-web": {
		tint: "180 65% 60%",
		initial: "A",
		glyph: "🛒",
		favicon: "https://github.com/vercel.png?size=64",
		bg: "linear-gradient(135deg, #8be9fd, #50fa7b)",
	},
	"docs-marketing": {
		tint: "48 75% 62%",
		initial: "Do",
		glyph: "📣",
		favicon: "https://github.com/mdn.png?size=64",
		bg: "linear-gradient(135deg, #f1fa8c, #ffb86c)",
	},
	"internal-tools": {
		tint: "135 55% 60%",
		initial: "In",
		glyph: "🔧",
		favicon: "https://github.com/linear.png?size=64",
		bg: "linear-gradient(135deg, #50fa7b, #8be9fd)",
	},
	playground: {
		tint: "20 78% 60%",
		initial: "Pl",
		glyph: "🎛",
		favicon: "https://github.com/anthropics.png?size=64",
		bg: "linear-gradient(135deg, #ffb86c, #ff5555)",
	},
};

// Pinned items per project — real things you keep going back to (docs / dev server / PR list)
const PINNED = {
	superset: [
		{ icon: "🧵", label: "PR #3891 · ACP agent" },
		{ icon: "🖥", label: "localhost:5173" },
		{ icon: "🗒", label: "AGENTS.md" },
	],
	"acme-web": [
		{ icon: "🛒", label: "PR #214 · checkout" },
		{ icon: "🖥", label: "localhost:3000" },
	],
	"docs-marketing": [{ icon: "📄", label: "changelog Q3" }],
	"internal-tools": [],
	playground: [],
};

function SpaceMark({ mode, t, size = 28 }) {
	// 三种识别方式的可视化 —— dock 圆点的核心内容
	if (mode === "favicon") {
		return (
			<img
				src={t.favicon}
				alt=""
				style={{
					width: size,
					height: size,
					borderRadius: 8,
					objectFit: "cover",
					display: "block",
				}}
			/>
		);
	}
	if (mode === "glyph") {
		return <span style={{ fontSize: size * 0.55 }}>{t.glyph}</span>;
	}
	return (
		<span style={{ fontSize: size * 0.38, fontWeight: 700 }}>{t.initial}</span>
	);
}

function ArcSidebar({
	activeProjectId,
	setActiveProjectId,
	activeWs,
	projectWs,
	extraWs,
	markMode,
	dockLabel,
}) {
	const project = projects.find((p) => p.id === activeProjectId);
	const tint = PROJECT_TINTS[project.id];
	const pinned = PINNED[project.id] || [];

	return (
		<div className="sb" style={{ "--tint": tint.tint }}>
			<div className="sb-top">
				<div className="sb-traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="sb-team">
					<span>wufan</span>
					<span className="sb-team-caret">▾</span>
				</div>
			</div>

			<div className="sb-search">
				<span>⌕</span>
				<span>搜索</span>
				<span className="sb-search-kbd">⌘ K</span>
			</div>

			<div className="sb-project-crumb">
				<span
					className="sb-project-mark"
					style={{
						background: markMode === "favicon" ? "transparent" : tint.bg,
					}}
				>
					<SpaceMark mode={markMode} t={tint} size={20} />
				</span>
				<span className="sb-project-name">{project.name}</span>
			</div>

			{activeWs ? (
				<div className="sb-now">
					<div className="sb-now-head">
						<span
							className="sb-now-pulse"
							style={{ color: `hsl(${tint.tint})` }}
						/>
						<span className="sb-now-title">{activeWs.name}</span>
					</div>
					<div className="sb-now-branch">{activeWs.branch}</div>
					<div className="sb-now-status">
						<span>{activeWs.statusLabel}</span>
						{activeWs.diff && (
							<>
								<span className="dotsep" />
								<span className="diff-add">+{activeWs.diff.add}</span>
								<span className="diff-del">−{activeWs.diff.del}</span>
							</>
						)}
					</div>
				</div>
			) : (
				<div className="sb-empty">这个项目还没有 workspace</div>
			)}

			{/* 偶尔多任务 — 显示额外的 workspace 作为简单行,不再是一整个层级 */}
			{extraWs.length > 0 && (
				<>
					<div className="sb-label">
						<span>其他分支</span>
						<button className="sb-label-btn" title="新建">
							+
						</button>
					</div>
					{extraWs.map((w) => (
						<button key={w.id} className="sb-row">
							<span className="sb-row-icon">⎇</span>
							<span className="sb-row-name">{w.name}</span>
							{w.status === "attention" && (
								<span className="sb-row-badge warm">!</span>
							)}
							{w.status === "running" && (
								<span className="sb-row-badge hot">·</span>
							)}
						</button>
					))}
				</>
			)}

			{pinned.length > 0 && (
				<>
					<div className="sb-label">
						<span>Pinned</span>
					</div>
					{pinned.map((p, i) => (
						<button key={i} className="sb-row">
							<span className="sb-row-icon">{p.icon}</span>
							<span className="sb-row-name">{p.label}</span>
						</button>
					))}
				</>
			)}

			<div className="sb-spaces-wrap">
				{dockLabel && (
					<div className="sb-spaces-label">
						{projects.find((p) => p.id === activeProjectId)?.name}
					</div>
				)}
				<div className="sb-spaces">
					{projects.map((p) => {
						const t = PROJECT_TINTS[p.id];
						const isActive = p.id === activeProjectId;
						return (
							<button
								key={p.id}
								className="sb-space"
								aria-current={isActive}
								style={{
									background: markMode === "favicon" ? "transparent" : t.bg,
									color: markMode === "initial" ? "rgba(0,0,0,0.8)" : "inherit",
								}}
								onClick={() => setActiveProjectId(p.id)}
								title={p.name}
							>
								<SpaceMark mode={markMode} t={t} />
								<span className="sb-space-tooltip">{p.name}</span>
							</button>
						);
					})}
					<button className="sb-space-add" title="新项目">
						+
					</button>
				</div>
			</div>

			<div className="sb-foot">
				<span>{projectWs.length} workspace</span>
				<div className="sb-foot-icons">
					<button title="端口">◐</button>
					<button title="设置">⚙</button>
				</div>
			</div>
		</div>
	);
}

function Main({ activeWs, project }) {
	if (!activeWs) {
		return (
			<div
				className="main"
				style={{
					display: "grid",
					placeItems: "center",
					color: "var(--fg-quiet)",
				}}
			>
				选一个 workspace
			</div>
		);
	}
	return (
		<div className="main">
			<div className="main-crumb">{project.name}</div>
			<h2>{activeWs.name}</h2>
			<div className="main-branch">{activeWs.branch}</div>
			<div className="main-panels">
				<div className="main-panel">
					<h4>Changes</h4>
					<div className="main-file">
						<span className="a">+42</span>
						<span className="d">−8</span>
						<span>apps/desktop/…/WorkspaceSidebar.tsx</span>
					</div>
					<div className="main-file">
						<span className="a">+18</span>
						<span className="d">−3</span>
						<span>apps/desktop/…/ProjectSection.tsx</span>
					</div>
					<div className="main-file">
						<span className="a">+9</span>
						<span className="d">−0</span>
						<span>apps/desktop/…/styles.css</span>
					</div>
				</div>
				<div className="main-panel">
					<h4>Agent</h4>
					<div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
						{activeWs.statusLabel}
					</div>
					<div
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: 11.5,
							color: "var(--fg-quiet)",
							marginTop: 6,
						}}
					>
						&gt; bun run test
					</div>
					<div
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: 11.5,
							color: "var(--fg-quiet)",
						}}
					>
						&gt; 12/18 passed
					</div>
				</div>
			</div>
		</div>
	);
}

function App() {
	const [activeProjectId, setActiveProjectId] = React.useState("superset");
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");
	const [markMode, setMarkMode] = React.useState("favicon"); // favicon | glyph | initial
	const [dockLabel, setDockLabel] = React.useState(true); // 底部圆点上方是否显示当前项目名

	const projectWs = workspaces.filter((w) => w.projectId === activeProjectId);
	const activeWs =
		projectWs.find((w) => w.id === activeWorkspaceId) || projectWs[0];
	const extraWs = projectWs.filter((w) => w.id !== activeWs?.id);
	const project = projects.find((p) => p.id === activeProjectId);

	const switchProject = (id) => {
		setActiveProjectId(id);
		const first = workspaces.find((w) => w.projectId === id);
		if (first) setActiveWorkspaceId(first.id);
	};

	const modes = [
		{ id: "favicon", label: "GitHub favicon", hint: "拉 org/user 头像" },
		{ id: "glyph", label: "Emoji / 图形", hint: "用户自选 (🧬 🛒 📣)" },
		{ id: "initial", label: "首字母", hint: "回退方案 (S / A / Do)" },
	];

	return (
		<div className="page">
			<div className="page-head">
				<div className="eyebrow">Sidebar · Arc-Spaces</div>
				<h1 className="page-title">项目怎么认?比一比 3 种</h1>
				<p className="page-desc">
					首字母确实靠猜 —— "D" 到底是 Docs 还是 Design?下面切换看三种识别方式。
					<strong>顶部的项目 crumb 永远显示全名 + 图标</strong>,底部 dock
					只做快速切换,悬停有 tooltip。 哪种最适合你,或者混着来?
				</p>

				<div className="mode-switch">
					<span className="mode-switch-label">识别方式</span>
					<div className="mode-switch-btns">
						{modes.map((m) => (
							<button
								key={m.id}
								aria-pressed={markMode === m.id}
								onClick={() => setMarkMode(m.id)}
							>
								<span className="mode-switch-btn-label">{m.label}</span>
								<span className="mode-switch-btn-hint">{m.hint}</span>
							</button>
						))}
					</div>
					<label className="mode-switch-toggle">
						<input
							type="checkbox"
							checked={dockLabel}
							onChange={(e) => setDockLabel(e.target.checked)}
						/>
						<span>dock 上方显示项目名</span>
					</label>
				</div>
			</div>

			<div className="app">
				<ArcSidebar
					activeProjectId={activeProjectId}
					setActiveProjectId={switchProject}
					activeWs={activeWs}
					projectWs={projectWs}
					extraWs={extraWs}
					markMode={markMode}
					dockLabel={dockLabel}
				/>
				<Main activeWs={activeWs} project={project} />
			</div>

			<div className="compare">
				<div className="compare-col">
					<h3>Favicon 模式 (推荐默认)</h3>
					<p>
						拉 GitHub org/user 头像作为项目图标 ——
						<strong>不用用户配置</strong>,识别度最高,和现在 Superset 的
						<code>ProjectThumbnail</code> 一致的思路。
					</p>
					<ul>
						<li>回退:没头像 → 自动降级为 emoji 或首字母</li>
						<li>hover 圆点直接显示项目全名 tooltip</li>
						<li>顶部 crumb 永远显示项目名全称,双保险</li>
					</ul>
				</div>
				<div className="compare-col">
					<h3>Emoji / Glyph 模式</h3>
					<p>
						每个项目一个用户自选的 emoji 或 2 字符短记号 —— 类似 Notion / Craft
						的做法。个性化最强,项目一眼分得清,不依赖 GitHub。
					</p>
					<ul>
						<li>用户在项目设置里选,和现在的 color 一样是个人化配置</li>
						<li>系统内置常用 emoji (🧬 🛒 📣 🔧 🎛) 作为初始选择</li>
						<li>拿掉背景色渐变,只留 emoji 本身也很清爽</li>
					</ul>
				</div>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
