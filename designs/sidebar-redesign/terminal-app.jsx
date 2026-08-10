// Terminal Refined — 保留 vibe,减一半密度
// 关键改动 vs V6:
//   • 宽度 320px → 内容有呼吸空间
//   • 每行 34px 高 (V6 是 20-22px),status + branch 主行 + diff/PR/status 副行,双行布局
//   • 树字符从 ├─ └─ 换成一列灰得几乎看不见的 │·,主字符不抢戏
//   • 项目和 workspace 之间加 8px 气,项目之间加 12px
//   • 只有 attention / running 用色,其余全灰阶
//   • ❯ prompt 元素统一放在页面/侧栏边界处,不再散落每行

const PROJECT_STYLES = {
	superset: { glyph: "S", bg: "linear-gradient(135deg, #ff79c6, #bd93f9)" },
	"acme-web": { glyph: "A", bg: "linear-gradient(135deg, #8be9fd, #50fa7b)" },
	"docs-marketing": {
		glyph: "D",
		bg: "linear-gradient(135deg, #f1fa8c, #ffb86c)",
	},
	"internal-tools": {
		glyph: "I",
		bg: "linear-gradient(135deg, #50fa7b, #8be9fd)",
	},
	playground: { glyph: "P", bg: "linear-gradient(135deg, #ffb86c, #ff5555)" },
};

function Sidebar({ activeWorkspaceId, setActiveWorkspaceId }) {
	const [openProjects, setOpenProjects] = React.useState(
		new Set(["superset", "acme-web"]),
	);

	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

	const toggle = (id) => {
		setOpenProjects((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<div className="sb">
			<div className="sb-top">
				<div className="sb-traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="sb-title">
					<span className="sb-title-prompt">~/</span>
					<span>workspaces</span>
				</div>
				<div className="sb-top-actions">
					<button title="搜索">/</button>
					<button title="新建">n</button>
					<button title="折叠全部">z</button>
				</div>
			</div>

			<div className="sb-search">
				<span style={{ color: "var(--primary)" }}>/</span>
				<span>搜索 workspace…</span>
				<span className="sb-search-slash">/</span>
			</div>

			{projects.map((p) => {
				const isOpen = openProjects.has(p.id);
				const style = PROJECT_STYLES[p.id];
				const projectWs = workspaces.filter((w) => w.projectId === p.id);
				const running = projectWs.filter((w) => w.status === "running").length;
				const attention = projectWs.filter(
					(w) => w.status === "attention",
				).length;
				const hasActiveHere = projectWs.some((w) => w.id === activeWorkspaceId);

				return (
					<div
						key={p.id}
						className={`sb-project ${isOpen ? "open" : "closed"}`}
					>
						<button
							className={`sb-project-head ${hasActiveHere ? "active" : ""}`}
							onClick={() => toggle(p.id)}
						>
							<span className="sb-project-caret">▾</span>
							<span
								className="sb-project-glyph"
								style={{ background: style.bg }}
							>
								{style.glyph}
							</span>
							<span className="sb-project-name">{p.name}</span>
							<span className="sb-project-meta">
								{running > 0 && <span className="pulse" />}
								{attention > 0 && <span className="attn">!{attention}</span>}
								<span>{projectWs.length}</span>
							</span>
						</button>

						{isOpen && (
							<div className="sb-ws-list">
								{projectWs.map((w, i) => {
									const isLast = i === projectWs.length - 1;
									return (
										<button
											key={w.id}
											className="sb-ws"
											aria-current={w.id === activeWorkspaceId}
											onClick={() => setActiveWorkspaceId(w.id)}
										>
											<span className="sb-ws-guide">{isLast ? "└" : "│"}</span>
											<div className="sb-ws-body">
												<div className="sb-ws-line1">
													<span className="sb-ws-glyph">
														{w.type === "worktree" ? "◆" : "◇"}
													</span>
													<span className="sb-ws-name">
														{w.name === w.branch ? w.branch : w.name}
													</span>
													<span className={`sb-ws-status ${w.status}`} />
												</div>
												<div className="sb-ws-line2">
													<span className="status-text">{w.statusLabel}</span>
													{w.diff && (
														<>
															<span className="dotsep" />
															<span className="add">+{w.diff.add}</span>
															<span className="del">−{w.diff.del}</span>
														</>
													)}
													{w.pr && (
														<>
															<span className="dotsep" />
															<span className="pr">#{w.pr.number}</span>
														</>
													)}
												</div>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}

			<div className="sb-foot">
				<div className="prompt-line">
					<span>❯</span>
					<span>on</span>
					<span className="branch">{activeWs?.branch || "—"}</span>
					<span className="cursor" />
				</div>
				<span className="foot-count">{workspaces.length}w</span>
			</div>
		</div>
	);
}

function Main({ activeWs }) {
	if (!activeWs) return null;
	const project = projects.find((p) => p.id === activeWs.projectId);
	return (
		<div className="main">
			<div className="main-crumb">
				{project.name} / {activeWs.type}
			</div>
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
						<span>apps/desktop/…/terminal-styles.css</span>
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
							marginTop: 8,
						}}
					>
						❯ bun run test
					</div>
					<div
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: 11.5,
							color: "var(--fg-quiet)",
						}}
					>
						❯ 12/18 passed
					</div>
				</div>
			</div>
		</div>
	);
}

function App() {
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");
	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

	return (
		<div className="page">
			<div className="page-head">
				<div className="eyebrow">Sidebar · Terminal Refined</div>
				<h1 className="page-title">Terminal vibe,少一半噪音</h1>
				<p className="page-desc">
					保留 <code>monospace</code>、shell prompt、<code>│</code>{" "}
					<code>└</code> 树字符、方块光标, 但把 workspace 行拉高到{" "}
					<strong>34px 双行</strong>(状态在主行,元信息在灰色副行), 项目之间加
					12px 空气,树字符降到几乎看不见 —— 让每一行是一个可读的独立单元,而不是
					log。
				</p>
			</div>

			<div className="app">
				<Sidebar
					activeWorkspaceId={activeWorkspaceId}
					setActiveWorkspaceId={setActiveWorkspaceId}
				/>
				<Main activeWs={activeWs} />
			</div>

			<div className="notes">
				<div className="notes-col">
					<h3>V6 里砍掉的东西</h3>
					<ul>
						<li>├─ 树字符 → 只留一列 │ / └,几乎透明</li>
						<li>每行 3px padding → 每行 34px 高,双行布局</li>
						<li>diff/PR/status 挤主行 → 全部下沉到副行灰字</li>
						<li>项目 header 无气 → 上下各 6-10px 呼吸</li>
						<li>处处 monospace 用色 → 只有 running/attention 用色</li>
					</ul>
				</div>
				<div className="notes-col">
					<h3>保留的 vibe</h3>
					<ul>
						<li>
							<strong>monospace</strong> 主字体,项目名和 branch 都用
						</li>
						<li>
							❯ prompt 只出现在<strong>标题、面包屑、底部命令行</strong>三处
						</li>
						<li>◆ / ◇ 区分 worktree / branch,一个字符解决</li>
						<li>
							底部 shell prompt <code>❯ on wufan/sidebar-redesign ▮</code>
						</li>
						<li>
							右上角 <code>/</code> <code>n</code> <code>z</code>{" "}
							三个键盘快捷键提示
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
