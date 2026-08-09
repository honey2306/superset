// App shell — 页面头部 + 3 版 variant 卡片,共享的 Canvas 组件在这里定义

function _Canvas({ workspace, project }) {
	if (!workspace) {
		return (
			<div
				className="canvas"
				style={{
					display: "grid",
					placeItems: "center",
					color: "var(--muted-foreground)",
				}}
			>
				选一个 workspace 看看
			</div>
		);
	}

	return (
		<div className="canvas">
			<div className="canvas-eyebrow">
				{project?.name} · {workspace.type}
			</div>
			<h2 className="canvas-title">{workspace.name}</h2>
			<div className="canvas-branch">{workspace.branch}</div>

			<div className="canvas-panels">
				<div className="canvas-panel">
					<h4>Changes</h4>
					<div className="canvas-file">
						<span className="stat-add">+42</span>
						<span className="stat-del">−8</span>
						<span>apps/desktop/…/WorkspaceSidebar.tsx</span>
					</div>
					<div className="canvas-file">
						<span className="stat-add">+18</span>
						<span className="stat-del">−3</span>
						<span>apps/desktop/…/ProjectHeader.tsx</span>
					</div>
					<div className="canvas-file">
						<span className="stat-add">+9</span>
						<span className="stat-del">−0</span>
						<span>apps/desktop/…/styles.css</span>
					</div>
				</div>

				<div className="canvas-panel">
					<h4>Agent</h4>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							fontSize: 12.5,
							color: "var(--muted-foreground)",
						}}
					>
						<div style={{ color: "var(--foreground)" }}>
							{workspace.statusLabel}
						</div>
						<div style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>
							&gt; running `bun run test` in packages/ui…
						</div>
						<div style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>
							&gt; 12/18 passed
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

const VARIANTS = [
	{
		id: "v1",
		badge: "V1",
		title: "Dual Rail",
		tagline: "项目图标栏 + workspace 主列表 · 物理隔离两个层级",
		body: (
			<>
				左侧 <strong>56px 图标轨道</strong> 只做"项目切换",右侧{" "}
				<strong>320px 列</strong> 只显示当前项目的 workspace。 项目和 workspace
				从视觉到空间都是完全独立的两件事,消除"这条线是项目还是分支"的困惑。
				分组标签 (Worktrees / 主仓库) 用 hairline 分割,workspace 行只保留:图标 ·
				名字 · PR 号 · 状态点。
			</>
		),
		meta: [
			{ k: "灵感", v: "Discord / Slack 服务器栏" },
			{ k: "适合", v: "同时开着 3+ 项目、需要频繁切" },
			{ k: "空间", v: "56 + 288 = 344px" },
		],
		render: () => <V1DualRail />,
	},
	{
		id: "v2",
		badge: "V2",
		title: "Focus / Accordion",
		tagline: "只展开当前项目,其他压成静默薄片",
		body: (
			<>
				任意时刻只有一个项目<strong>展开</strong>为卡片区域,其他项目退化成 40px
				高的 pill —— 名字 + 计数 + 一个脉动点表明有活。 展开区里,workspace
				行的元信息(branch 名、PR、耗时)全部下沉到<strong>第二行小字</strong>
				,主行只留名字和 diff。
				整个侧边栏像一叠合起来的文件夹,呼吸感来自"压缩比"而非"分隔线"。
			</>
		),
		meta: [
			{ k: "灵感", v: "Linear 项目切换 / Notion sidebar" },
			{ k: "适合", v: "一次专注一个项目" },
			{ k: "空间", v: "320px" },
		],
		render: () => <V2Focus />,
	},
	{
		id: "v3",
		badge: "V3",
		title: "Activity Stream",
		tagline: "扁平时间流 + 项目降级为 chip 过滤器",
		body: (
			<>
				彻底放弃"项目 → workspace"的层级。列表按<strong>最近活跃度</strong>
				排序,顶部的项目 chip 只是过滤器。 每一行是一张
				<strong>迷你活动卡</strong>:项目色 tag + workspace 名 + 一句人话状态 +
				右侧 diff/PR。 左侧 3px 项目色轨道保留归属线索。像刷 GitHub
				notifications,而不是导航一棵树。
			</>
		),
		meta: [
			{ k: "灵感", v: "GitHub notifications / Linear inbox" },
			{ k: "适合", v: "多项目并行、按任务而非按仓库切换" },
			{ k: "空间", v: "320px" },
		],
		render: () => <V3Activity />,
	},
	{
		id: "v4",
		badge: "V4",
		title: "Zen · ⌘K-first",
		tagline: "极窄 240px,只留当前 workspace 英雄卡 + Pinned/Recent 两小节",
		body: (
			<>
				灵感来自 Raycast 和 Linear:<strong>永久可见的东西越少越好</strong>
				。顶部一张"当前 workspace"大卡,承担 90% 的信息量; 剩下只留 Pinned
				(你钉的 2–3 个) + Recent 5 个。<strong>项目切换从侧边栏消失</strong>
				,靠一颗大按钮"⌘K"召唤命令面板。
				代价是切项目多按一次键;收益是侧边栏永远不拥挤 ——
				侧栏永远只有"一个视野"。
			</>
		),
		meta: [
			{ k: "灵感", v: "Raycast / Linear / Superhuman" },
			{ k: "适合", v: "键盘党、只专注 1–2 个任务" },
			{ k: "空间", v: "240px (最窄)" },
		],
		render: () => <V4Zen />,
	},
	{
		id: "v5",
		badge: "V5",
		title: "Timeline",
		tagline: "竖直时间轴 + 状态节点,按今天/本周/更早分桶",
		body: (
			<>
				用一条时间轴当骨架 —— workspace 是轴上的<strong>状态节点</strong>
				(圆圈填色 = running/attention/ready/idle)。 每个节点左侧一条 3px
				项目色条,项目区分不靠标题,而靠这道<strong>色码</strong>。
				节点之间竖线相连,像看代码提交历史或者 GitHub contributions 的立视图。
				适合"今天在动的项目 vs 睡着的项目"一眼分开的心智。
			</>
		),
		meta: [
			{ k: "灵感", v: "Git log / 日程轴 / GitHub timeline" },
			{ k: "适合", v: "关心'什么时候做了什么'" },
			{ k: "空间", v: "340px" },
		],
		render: () => <V5Timeline />,
	},
	{
		id: "v6",
		badge: "V6",
		title: "Terminal · TUI Tree",
		tagline: "全 monospace 树,极致密度,像 lazygit / NvimTree",
		body: (
			<>
				<strong>完全 monospace</strong>,项目和 workspace 用 tree 结构 (├─ └─)
				缩进,项目色只保留一个 2 字符 pill 前缀。 每个 workspace 一行,极限密度下
				25 行能塞 5 项目 12 workspace。所有元信息用 <code>+12 −3</code>{" "}
				<code>#3891</code> 这样的 原文字符 —— 不用色块、不用图标。底部有 shell
				prompt 呼应 Dracula 主题的 hacker vibe。 适合喜欢 Vim / lazygit
				的用户,拒绝所有装饰。
			</>
		),
		meta: [
			{ k: "灵感", v: "lazygit / NvimTree / tig" },
			{ k: "适合", v: "极客、追求信息密度" },
			{ k: "空间", v: "320px" },
		],
		render: () => <V6Terminal />,
	},
];

function ThemeSwitch({ theme, onChange }) {
	const themes = [
		{ id: "dracula", label: "Dracula" },
		{ id: "ember", label: "Ember" },
		{ id: "zed", label: "Zed" },
	];
	return (
		<div className="theme-switch" role="group" aria-label="Theme">
			{themes.map((t) => (
				<button
					key={t.id}
					aria-pressed={theme === t.id}
					onClick={() => onChange(t.id)}
				>
					{t.label}
				</button>
			))}
		</div>
	);
}

function App() {
	const [theme, setTheme] = React.useState(() => {
		try {
			return localStorage.getItem("sidebar-redesign-theme") || "dracula";
		} catch {
			return "dracula";
		}
	});

	React.useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
		try {
			localStorage.setItem("sidebar-redesign-theme", theme);
		} catch {}
	}, [theme]);

	return (
		<div className="page">
			<div className="page-header">
				<div className="page-titles">
					<div className="eyebrow">Sidebar redesign · 6 versions</div>
					<h1 className="page-title">左边栏,减压 6 种做法</h1>
					<p className="page-desc">
						相同的项目+workspace 数据,6 个结构完全不同的探索。V1–V3 探索
						<strong>层级结构</strong>, V4–V6 探索<strong>心智模式</strong>
						(最小化 / 时间叙事 / 极客密度)。都跑在你现有的 Dracula / Ember / Zed
						主题上。
					</p>
				</div>
				<ThemeSwitch theme={theme} onChange={setTheme} />
			</div>

			{VARIANTS.map((v) => (
				<section key={v.id} className="variant">
					<div className="variant-head">
						<span className="variant-badge">{v.badge}</span>
						<span className="variant-title">{v.title}</span>
						<span style={{ color: "var(--muted-foreground)", fontSize: 12.5 }}>
							· {v.tagline}
						</span>
					</div>
					<p className="variant-desc">{v.body}</p>
					<div className="variant-meta">
						{v.meta.map((m) => (
							<div key={m.k}>
								<strong>{m.k}</strong>
								<span>{m.v}</span>
							</div>
						))}
					</div>
					{v.render()}
				</section>
			))}
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
