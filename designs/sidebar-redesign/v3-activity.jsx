// V3 — Activity Stream
// 抛弃"项目 → workspace"的层级,改成一条按最近活跃度排序的 workspace 流。
// 项目降级为顶部的 chip 过滤器 —— 需要时才用来筛选,不再是主结构。
// 每个 workspace 行左侧带项目色轨道,视觉上仍能看出归属,但列表本身是扁平的。

function V3Activity() {
	const [selectedProjectId, setSelectedProjectId] = React.useState(null); // null = 全部
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");

	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
	const activeProject = projects.find((p) => p.id === activeWs?.projectId);

	const ordered = recentActivity
		.map((id) => workspaces.find((w) => w.id === id))
		.filter(Boolean)
		.filter((w) => !selectedProjectId || w.projectId === selectedProjectId);

	const activeCount = workspaces.filter(
		(w) =>
			w.status === "running" ||
			w.status === "attention" ||
			w.status === "ready",
	).length;

	return (
		<div className="chrome">
			<div className="chrome-header">
				<div className="traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="chrome-address">
					superset · activity · {activeWs?.branch}
				</div>
				<div style={{ width: 48 }} />
			</div>
			<div className="chrome-body">
				<div className="v3">
					<div className="v3-head">
						<div className="v3-brand">
							<div className="v3-brand-title">Activity</div>
							<div className="v3-brand-actions">
								<button title="过滤">
									<IconFilter size={14} />
								</button>
								<button title="搜索">
									<IconSearch size={14} />
								</button>
								<button title="新建">
									<IconPlus size={14} />
								</button>
							</div>
						</div>

						<div className="v3-chips">
							<button
								className="v3-chip all"
								aria-pressed={selectedProjectId === null}
								onClick={() => setSelectedProjectId(null)}
							>
								全部 <span className="v3-chip-count">{workspaces.length}</span>
							</button>
							{projects.map((p) => {
								const count = workspaces.filter(
									(w) => w.projectId === p.id,
								).length;
								return (
									<button
										key={p.id}
										className="v3-chip"
										aria-pressed={selectedProjectId === p.id}
										onClick={() =>
											setSelectedProjectId(
												selectedProjectId === p.id ? null : p.id,
											)
										}
									>
										<span
											className="v3-chip-dot"
											style={{
												background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
											}}
										/>
										{p.name}
										<span className="v3-chip-count">{count}</span>
									</button>
								);
							})}
						</div>
					</div>

					<div className="v3-section-title">
						<span>最近活跃</span>
						<span>{ordered.length} · 按时间</span>
					</div>

					<div className="v3-list">
						{ordered.map((ws) => (
							<V3Ws
								key={ws.id}
								ws={ws}
								isActive={ws.id === activeWorkspaceId}
								onClick={() => setActiveWorkspaceId(ws.id)}
							/>
						))}
					</div>

					<div className="v3-foot">
						<div className="v3-foot-left">
							<div className="v3-foot-avatar">W</div>
							<span>{activeCount} 个 workspace 需关注</span>
						</div>
						<div className="v3-foot-right">
							<button title="端口">
								<IconPort size={14} />
							</button>
							<button title="终端">
								<IconTerminal size={14} />
							</button>
							<button title="设置">
								<IconSettings size={14} />
							</button>
						</div>
					</div>
				</div>

				<Canvas workspace={activeWs} project={activeProject} />
			</div>
		</div>
	);
}

function V3Ws({ ws, isActive, onClick }) {
	const project = projects.find((p) => p.id === ws.projectId);
	const prClass = ws.pr ? `v3-ws-pr ${ws.pr.state}` : null;

	return (
		<button className="v3-ws" aria-current={isActive} onClick={onClick}>
			<span
				className="v3-ws-rail"
				style={{
					background: isActive
						? `linear-gradient(180deg, ${project.color}, ${project.color2})`
						: "transparent",
				}}
			/>
			<div className="v3-ws-body">
				<div className="v3-ws-top">
					<span
						className="v3-ws-project-tag"
						style={{
							background: `linear-gradient(135deg, ${project.color}, ${project.color2})`,
						}}
					>
						{project.name}
					</span>
					<span className="v3-ws-time">{ws.time}</span>
				</div>
				<span className="v3-ws-name">{ws.name}</span>
				<div className="v3-ws-status-line">
					<span className={`v3-ws-status-dot ${ws.status}`} />
					<span
						className={`v3-ws-status-text ${ws.status === "idle" ? "dim" : ""}`}
					>
						{ws.statusLabel}
					</span>
				</div>
			</div>
			<div className="v3-ws-meta">
				{ws.diff && (
					<span className="v3-ws-diff">
						<span className="add">+{ws.diff.add}</span>{" "}
						<span className="del">−{ws.diff.del}</span>
					</span>
				)}
				{ws.pr && <span className={prClass}>#{ws.pr.number}</span>}
			</div>
		</button>
	);
}

Object.assign(window, { V3Activity });
