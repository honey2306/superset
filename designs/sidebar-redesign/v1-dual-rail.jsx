// V1 — Dual Rail
// 项目物理隔离到 48px 图标栏,workspace 主列表独占一列。
// 项目切换和 workspace 选择在视觉上彻底分离,减少"哪个是项目哪个是分支"的困惑。

function V1DualRail() {
	const [activeProjectId, setActiveProjectId] = React.useState("superset");
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");

	const activeProject = projects.find((p) => p.id === activeProjectId);
	const projectWorkspaces = workspaces.filter(
		(w) => w.projectId === activeProjectId,
	);
	const worktrees = projectWorkspaces.filter((w) => w.type === "worktree");
	const branchOnly = projectWorkspaces.filter((w) => w.type === "branch");

	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

	const projectBadge = (p) => {
		const unread = workspaces.filter(
			(w) =>
				w.projectId === p.id &&
				(w.status === "attention" || w.status === "running"),
		).length;
		return unread || null;
	};

	return (
		<div className="chrome">
			<div className="chrome-header">
				<div className="traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="chrome-address">
					superset · {activeProject?.name} · {activeWs?.branch || "—"}
				</div>
				<div style={{ width: 48 }} />
			</div>
			<div className="chrome-body">
				<div className="v1">
					<div className="v1-rail">
						{projects.map((p) => {
							const badge = projectBadge(p);
							const isActive = p.id === activeProjectId;
							return (
								<button
									key={p.id}
									className="v1-rail-item"
									aria-current={isActive}
									onClick={() => {
										setActiveProjectId(p.id);
										const first = workspaces.find((w) => w.projectId === p.id);
										if (first) setActiveWorkspaceId(first.id);
									}}
									title={p.name}
								>
									<div
										className="v1-project-avatar"
										style={{
											background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
										}}
									>
										{p.initial}
									</div>
									{badge && <span className="v1-rail-badge">{badge}</span>}
								</button>
							);
						})}
						<div className="v1-rail-sep" />
						<button className="v1-rail-item v1-rail-icon-btn" title="添加项目">
							<IconPlus size={16} />
						</button>
						<div style={{ flex: 1 }} />
						<button
							className="v1-rail-item v1-rail-icon-btn"
							title="命令面板 ⌘K"
						>
							<IconCommand size={16} />
						</button>
						<button className="v1-rail-item v1-rail-icon-btn" title="设置">
							<IconSettings size={16} />
						</button>
					</div>

					<div className="v1-column">
						<div className="v1-column-head">
							<div className="v1-column-eyebrow">项目</div>
							<div className="v1-column-title">
								<h3>
									<span
										className="v1-column-dot"
										style={{
											background: `linear-gradient(135deg, ${activeProject?.color}, ${activeProject?.color2})`,
										}}
									/>
									{activeProject?.name}
								</h3>
								<span className="v1-column-count">
									{projectWorkspaces.length} 个 workspace
								</span>
							</div>
							<div className="v1-column-search">
								<IconSearch size={13} />
								<span>搜索 workspace…</span>
								<span
									style={{
										marginLeft: "auto",
										fontFamily: "var(--font-mono)",
										opacity: 0.5,
									}}
								>
									⌘ P
								</span>
							</div>
						</div>

						<div className="v1-list">
							<div className="v1-section-label">
								<IconWorktree size={11} stroke={2} />
								Worktrees
							</div>
							{worktrees.map((ws) => (
								<WsRow
									key={ws.id}
									ws={ws}
									isActive={ws.id === activeWorkspaceId}
									onClick={() => setActiveWorkspaceId(ws.id)}
								/>
							))}

							{branchOnly.length > 0 && (
								<>
									<div className="v1-section-label">
										<IconBranch size={11} stroke={2} />
										主仓库
									</div>
									{branchOnly.map((ws) => (
										<WsRow
											key={ws.id}
											ws={ws}
											isActive={ws.id === activeWorkspaceId}
											onClick={() => setActiveWorkspaceId(ws.id)}
										/>
									))}
								</>
							)}

							<button
								className="v1-ws"
								style={{
									color: "var(--muted-foreground)",
									marginTop: 8,
									opacity: 0.75,
								}}
							>
								<span className="v1-ws-icon">
									<IconPlus size={12} />
								</span>
								<div className="v1-ws-body">
									<span
										className="v1-ws-name"
										style={{ color: "var(--muted-foreground)" }}
									>
										新建 workspace
									</span>
								</div>
							</button>
						</div>

						<div className="v1-column-foot">
							<span className="port-dot" />
							<span>3 个端口活跃 · :3000 :5173 :8080</span>
						</div>
					</div>
				</div>

				<Canvas workspace={activeWs} project={activeProject} />
			</div>
		</div>
	);
}

function WsRow({ ws, isActive, onClick }) {
	return (
		<button className="v1-ws" aria-current={isActive} onClick={onClick}>
			<span className="v1-ws-icon">
				{ws.type === "worktree" ? (
					<IconWorktree size={13} />
				) : (
					<IconBranch size={13} />
				)}
			</span>
			<div className="v1-ws-body">
				<span className="v1-ws-name">{ws.name}</span>
				{ws.name !== ws.branch && (
					<span className="v1-ws-branch">{ws.branch}</span>
				)}
			</div>
			{ws.pr && <span className="v1-ws-pr">#{ws.pr.number}</span>}
			<span className={`v1-ws-status ${ws.status}`} />
		</button>
	);
}

Object.assign(window, { V1DualRail });
