// V6 — Terminal · TUI Tree
// 全 monospace,tree 结构。项目 = 顶层节点,workspace = 子节点。缩进用 · ├ └ 画树。
// 项目色只留一个前缀色标(2 字符 pill),避免头像/大色块的视觉噪音。
// 极致密度 —— 25 行也能塞得下 5 项目 12 workspace。像 lazygit / neovim NvimTree。
// 底部有一条 shell prompt,呼应你 Dracula 主题的 hacker vibe。

function V6Terminal() {
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");
	const [openProjects, setOpenProjects] = React.useState(
		new Set(["superset", "acme-web"]),
	);

	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
	const activeProject = projects.find((p) => p.id === activeWs?.projectId);

	const toggleProject = (id) => {
		setOpenProjects((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<div className="chrome">
			<div className="chrome-header">
				<div className="traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="chrome-address">~/superset · {activeWs?.branch}</div>
				<div style={{ width: 48 }} />
			</div>
			<div className="chrome-body">
				<div className="v6">
					<div className="v6-head">
						<div className="v6-head-title">workspaces.tree</div>
						<div className="v6-head-actions">
							<button title="搜索 /">
								<span>/</span>
							</button>
							<button title="新建 n">
								<span>n</span>
							</button>
							<button title="展开全部 z">
								<span>z</span>
							</button>
						</div>
					</div>

					<div className="v6-tree">
						{projects.map((p) => {
							const isOpen = openProjects.has(p.id);
							const projectWs = workspaces.filter((w) => w.projectId === p.id);
							const attention = projectWs.filter(
								(w) => w.status === "attention",
							).length;
							return (
								<React.Fragment key={p.id}>
									<button
										className={`v6-project-line ${isOpen ? "open" : "closed"}`}
										onClick={() => toggleProject(p.id)}
									>
										<span className="v6-caret" />
										<span
											className="v6-project-glyph"
											style={{
												background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
											}}
										>
											{p.initial}
										</span>
										<span className="v6-project-name">
											{p.name.toLowerCase().replace(/\s+/g, "-")}
										</span>
										{attention > 0 && (
											<span className="v6-project-badge">!{attention}</span>
										)}
										<span className="v6-project-count">{projectWs.length}</span>
									</button>

									{isOpen &&
										projectWs.map((w, i) => {
											const isLast = i === projectWs.length - 1;
											return (
												<button
													key={w.id}
													className="v6-row"
													aria-current={w.id === activeWorkspaceId}
													onClick={() => setActiveWorkspaceId(w.id)}
												>
													<span className="v6-row-prefix">
														{isLast ? "└─" : "├─"}
													</span>
													<span className="v6-row-body">
														<span className="v6-row-icon">
															{w.type === "worktree" ? "◆" : "◇"}
														</span>
														<span className="v6-row-name">
															{w.name === w.branch ? w.branch : w.branch}
														</span>
													</span>
													<span className="v6-row-meta">
														{w.diff && (
															<span>
																<span className="add">+{w.diff.add}</span>{" "}
																<span className="del">−{w.diff.del}</span>
															</span>
														)}
														{w.pr && <span>#{w.pr.number}</span>}
														<span className={`v6-row-status ${w.status}`} />
													</span>
												</button>
											);
										})}
								</React.Fragment>
							);
						})}
					</div>

					<div className="v6-foot">
						<span>
							<span className="prompt">❯</span> git switch{" "}
							<span style={{ color: "var(--foreground)" }}>
								{activeWs?.branch}
							</span>
							<span className="cursor" />
						</span>
						<span>{workspaces.length}w</span>
					</div>
				</div>

				<Canvas workspace={activeWs} project={activeProject} />
			</div>
		</div>
	);
}

Object.assign(window, { V6Terminal });
