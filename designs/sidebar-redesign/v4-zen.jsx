// V4 — Zen · ⌘K-first
// 240px 极窄。顶部一张"当前 workspace"英雄卡,把最有用的信息(名字、分支、agent 状态、diff、PR)全部
// 集中在那里。下方只保留 Pinned + Recent 两小节,每行只留一个圆点 + 名字 + 状态点。
// 项目切换完全不占空间,靠 ⌘K 面板 —— 借鉴 Raycast / Linear 的"最少永久可见控件"哲学。

function V4Zen() {
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");
	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
	const activeProject = projects.find((p) => p.id === activeWs?.projectId);

	// 收藏(手动 pinned) — mock:两个
	const pinnedIds = ["ws-sidebar", "ws-checkout"];
	const pinned = pinnedIds
		.map((id) => workspaces.find((w) => w.id === id))
		.filter(Boolean);

	const recent = recentActivity
		.map((id) => workspaces.find((w) => w.id === id))
		.filter(Boolean)
		.filter((w) => w.id !== activeWorkspaceId && !pinnedIds.includes(w.id))
		.slice(0, 5);

	return (
		<div className="chrome">
			<div className="chrome-header">
				<div className="traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="chrome-address">
					{activeProject?.name} · {activeWs?.branch}
				</div>
				<div style={{ width: 48 }} />
			</div>
			<div className="chrome-body">
				<div className="v4">
					<div className="v4-topbar">
						<div className="v4-workspace-mark">
							<span className="v4-workspace-mark-dot" />
							Workspaces
						</div>
						<div className="v4-topbar-actions">
							<button title="收件箱">
								<IconInbox size={13} />
							</button>
							<button title="设置">
								<IconSettings size={13} />
							</button>
						</div>
					</div>

					<div className="v4-hero">
						<div className="v4-hero-eyebrow">
							<span
								className="v4-hero-eyebrow-tag"
								style={{
									background: `linear-gradient(135deg, ${activeProject?.color}, ${activeProject?.color2})`,
								}}
							>
								{activeProject?.name}
							</span>
							<span>· 当前</span>
							{activeWs?.status === "running" && (
								<span className="v4-hero-eyebrow-pulse" />
							)}
						</div>
						<div className="v4-hero-title">{activeWs?.name}</div>
						<div className="v4-hero-branch">{activeWs?.branch}</div>
						<div className="v4-hero-status">
							<span className="v4-hero-status-dot" />
							{activeWs?.statusLabel}
						</div>
						<div className="v4-hero-metrics">
							{activeWs?.diff && (
								<>
									<span>
										<span className="add">+{activeWs.diff.add}</span>{" "}
										<span className="del">−{activeWs.diff.del}</span>
									</span>
									<span className="sep" />
								</>
							)}
							{activeWs?.pr && (
								<>
									<span className="pr">PR #{activeWs.pr.number}</span>
									<span className="sep" />
								</>
							)}
							<span>{activeWs?.time} 前</span>
						</div>
					</div>

					<button className="v4-cmdk">
						<IconSearch size={13} />
						<span>切换 workspace 或项目…</span>
						<span className="v4-cmdk-hint">⌘ K</span>
					</button>

					<div className="v4-group">
						<div className="v4-group-label">
							<IconStar size={10} stroke={2} /> Pinned
						</div>
						{pinned.map((w) => {
							const p = projects.find((pp) => pp.id === w.projectId);
							return (
								<button
									key={w.id}
									className="v4-item"
									aria-current={w.id === activeWorkspaceId}
									onClick={() => setActiveWorkspaceId(w.id)}
								>
									<span
										className="v4-item-mark"
										style={{
											background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
										}}
									/>
									<span className="v4-item-name">{w.name}</span>
									<span className={`v4-item-status ${w.status}`} />
								</button>
							);
						})}
					</div>

					<div className="v4-group">
						<div className="v4-group-label">
							<IconClock size={10} stroke={2} /> Recent
						</div>
						{recent.map((w) => {
							const p = projects.find((pp) => pp.id === w.projectId);
							return (
								<button
									key={w.id}
									className="v4-item"
									onClick={() => setActiveWorkspaceId(w.id)}
								>
									<span
										className="v4-item-mark"
										style={{
											background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
										}}
									/>
									<span className="v4-item-name">{w.name}</span>
									<span className={`v4-item-status ${w.status}`} />
								</button>
							);
						})}
					</div>

					<div className="v4-foot">
						<span>
							{projects.length} 项目 · {workspaces.length} workspace
						</span>
						<span>⌘ K</span>
					</div>
				</div>

				<Canvas workspace={activeWs} project={activeProject} />
			</div>
		</div>
	);
}

Object.assign(window, { V4Zen });
