// Plain — 3 版极素侧边栏对比
// 共同底线:
//   • 只在 active 项目上用一抹主色 (--primary),其他项目全灰
//   • workspace 行只留 branch 名字 + 状态圆点 (running/attention/ready)
//   • 无 emoji,无渐变色块,无 monospace 装饰,无边框卡片
//   • 三版结构完全一样,只是"字体、间距、层级表达"三种做法

function StatusDot({ status }) {
	if (!status || status === "idle") return null;
	return <span className={`dot ${status}`} />;
}

/* ================================================================
   V1 · Linear / Things — 纯文字 + 缩进
   项目名小,workspace 缩进但保持相近字号;
   完全靠层级(项目 dim,workspace normal)
   ================================================================ */
function LinearSidebar({ activeWs, setActiveWs, activeProjectId }) {
	return (
		<div className="sb linear-sb">
			<div className="linear-search">
				<span>搜索</span>
				<span className="linear-search-kbd">⌘K</span>
			</div>

			{projects.map((p) => {
				const ws = workspaces.filter((w) => w.projectId === p.id);
				const isActive = p.id === activeProjectId;
				return (
					<div key={p.id} className="linear-project">
						<button
							className={`linear-project-head ${isActive ? "active" : ""}`}
						>
							<span>{p.name}</span>
							<span className="linear-project-count">{ws.length}</span>
						</button>
						<div className="linear-ws-list">
							{ws.map((w) => (
								<button
									key={w.id}
									className="linear-ws"
									aria-current={w.id === activeWs}
									onClick={() => setActiveWs(w.id)}
								>
									<span className="linear-ws-name">{w.name}</span>
									<StatusDot status={w.status} />
								</button>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/* ================================================================
   V2 · Notion — 每个项目一个小 svg icon (灰,不是色块)
   有折叠 caret,workspace 靠图标宽度对齐缩进
   ================================================================ */
function FolderIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
		</svg>
	);
}

function NotionSidebar({ activeWs, setActiveWs, activeProjectId }) {
	const [open, setOpen] = React.useState(new Set(projects.map((p) => p.id)));
	const toggle = (id) => {
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<div className="sb notion-sb">
			<button className="notion-search">
				<span>搜索</span>
				<span className="notion-search-kbd">⌘K</span>
			</button>

			{projects.map((p) => {
				const ws = workspaces.filter((w) => w.projectId === p.id);
				const isOpen = open.has(p.id);
				const isActive = p.id === activeProjectId;
				return (
					<div
						key={p.id}
						className={`notion-project ${isOpen ? "open" : "closed"}`}
					>
						<button
							className={`notion-project-head ${isActive ? "active" : ""}`}
							onClick={() => toggle(p.id)}
						>
							<span className="notion-project-caret">▾</span>
							<span className="notion-project-icon">
								<FolderIcon />
							</span>
							<span className="notion-project-name">{p.name}</span>
							<span className="notion-project-count">{ws.length}</span>
						</button>
						{isOpen && (
							<div className="notion-ws-list">
								{ws.map((w) => (
									<button
										key={w.id}
										className="notion-ws"
										aria-current={w.id === activeWs}
										onClick={() => setActiveWs(w.id)}
									>
										<span className="notion-ws-name">{w.name}</span>
										<StatusDot status={w.status} />
									</button>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

/* ================================================================
   V3 · Craft — 重头轻尾
   项目名:全大写小字号,像章节标题;active 项目变成大字并加下划线
   workspace 极小,像目录条目
   ================================================================ */
function CraftSidebar({ activeWs, setActiveWs, activeProjectId }) {
	return (
		<div className="sb craft-sb">
			<div className="craft-search">
				<span>搜索</span>
				<span className="craft-search-kbd">⌘K</span>
			</div>

			{projects.map((p) => {
				const ws = workspaces.filter((w) => w.projectId === p.id);
				const isActive = p.id === activeProjectId;
				return (
					<div key={p.id} className="craft-project">
						<button
							className={`craft-project-head ${isActive ? "active" : ""}`}
						>
							<span>{p.name}</span>
							<span className="craft-project-count">{ws.length}</span>
						</button>
						<div className="craft-ws-list">
							{ws.map((w) => (
								<button
									key={w.id}
									className="craft-ws"
									aria-current={w.id === activeWs}
									onClick={() => setActiveWs(w.id)}
								>
									<span className="craft-ws-name">{w.name}</span>
									<StatusDot status={w.status} />
								</button>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/* ================================================================
   Fake main panel — 三版共用
   ================================================================ */
function Main({ activeWs }) {
	if (!activeWs) return null;
	const project = projects.find((p) => p.id === activeWs.projectId);
	return (
		<div className="main">
			<div className="main-crumb">{project.name}</div>
			<h2>{activeWs.name}</h2>
			<div className="main-branch">{activeWs.branch}</div>
			<div className="main-panels">
				<div className="main-panel">
					<h4>Changes</h4>
					<p>3 files · +69 −11</p>
					<p style={{ marginTop: 8, color: "var(--fg-quiet)", fontSize: 12 }}>
						主区域承担 diff/PR/agent status 全部细节
					</p>
				</div>
				<div className="main-panel">
					<h4>Agent</h4>
					<p>{activeWs.statusLabel}</p>
				</div>
			</div>
		</div>
	);
}

/* ================================================================
   App shell
   ================================================================ */
function VariantShell({ badge, title, desc, children, activeWs }) {
	return (
		<section className="variant">
			<div className="variant-head">
				<span className="variant-badge">{badge}</span>
				<span className="variant-title">{title}</span>
			</div>
			<p className="variant-desc">{desc}</p>
			<div className="app">
				<div className="chrome-bar">
					<div className="traffic">
						<span />
						<span />
						<span />
					</div>
					<div className="chrome-addr">{activeWs?.branch || "—"}</div>
					<div style={{ width: 48 }} />
				</div>
				<div className="app-body">
					{children}
					<Main activeWs={activeWs} />
				</div>
			</div>
		</section>
	);
}

function App() {
	const [activeWs, setActiveWs] = React.useState("ws-acp-agent");
	const activeWsObj = workspaces.find((w) => w.id === activeWs);
	const activeProjectId = activeWsObj?.projectId;

	return (
		<div className="page">
			<div className="page-head">
				<div className="eyebrow">Sidebar · Plain</div>
				<h1 className="page-title">3 版极素对比</h1>
				<p className="page-desc">
					共同底线:<strong>只在当前项目/workspace 用一抹主色</strong>
					,其他项目全灰; workspace 行只留名字 + 状态圆点; 无 emoji、无渐变、无
					monospace、无 tree 字符。 三版只是"层级如何表达"三种做法。
				</p>
			</div>

			<VariantShell
				badge="A"
				title="Linear / Things — 纯文字 + 缩进"
				desc="项目名小,workspace 缩进但字号相近;层级完全靠字色和缩进,没有任何 icon 或分隔线。"
				activeWs={activeWsObj}
			>
				<LinearSidebar
					activeWs={activeWs}
					setActiveWs={setActiveWs}
					activeProjectId={activeProjectId}
				/>
			</VariantShell>

			<VariantShell
				badge="B"
				title="Notion — 项目带一个灰 folder icon"
				desc={
					'每个项目行前放一个 svg folder 图标(灰色,不是色块),加折叠 caret。active 项目图标变主色 —— 保持"每行一个可点击 target"的自然感。'
				}
				activeWs={activeWsObj}
			>
				<NotionSidebar
					activeWs={activeWs}
					setActiveWs={setActiveWs}
					activeProjectId={activeProjectId}
				/>
			</VariantShell>

			<VariantShell
				badge="C"
				title="Craft — 重头轻尾"
				desc="项目行像章节标题(全大写、小字号、下有 hairline);active 项目才变成大字、去大写、hairline 变主色。workspace 极小、贴近。项目地位远高于 workspace。"
				activeWs={activeWsObj}
			>
				<CraftSidebar
					activeWs={activeWs}
					setActiveWs={setActiveWs}
					activeProjectId={activeProjectId}
				/>
			</VariantShell>

			<div className="notes">
				<div className="notes-col">
					<h3>A · Linear</h3>
					<p>
						项目和 workspace 视觉上<strong>几乎平等</strong>,只靠字色和 4px
						缩进区分。 最像 Linear 的 Team/Project 列表。
					</p>
				</div>
				<div className="notes-col">
					<h3>B · Notion</h3>
					<p>
						项目多了一个<strong>灰色 folder icon</strong> —— 视觉锚点,方便扫。
						active 时图标染主色。折叠 caret 让"层级"这件事被承认。
					</p>
				</div>
				<div className="notes-col">
					<h3>C · Craft</h3>
					<p>
						项目<strong>压得非常低</strong>(全大写小字标签),workspace 才是主角。
						active 项目会"隆起"变大 —— 明显的层级仪式感,但仍无色无图。
					</p>
				</div>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
