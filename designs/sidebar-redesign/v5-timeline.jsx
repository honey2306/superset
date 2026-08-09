// V5 — Timeline
// 用一条竖直时间轴当骨架。workspace 是轴上的节点,节点填充色 = 状态,左侧 3px 短条 = 项目色。
// 按 今天 / 昨天 / 本周 / 更早 分桶。项目区分靠色条,而不是标题分组 —— 视觉上像 Git log 或
// GitHub contributions 的竖版:一天里发生了什么、哪个项目在动,一屏看清。

function V5Timeline() {
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");
	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
	const activeProject = projects.find((p) => p.id === activeWs?.projectId);

	// 根据 time 字段分桶(mock — 简单基于字符判断)
	const bucketOf = (time) => {
		if (!time || time === "—") return "更早";
		if (/^(\d+)m$/.test(time) || /^(\d+)h$/.test(time)) return "今天";
		if (time === "1d" || time === "2d") return "本周早些";
		return "更早";
	};

	const orderedWs = recentActivity
		.map((id) => workspaces.find((w) => w.id === id))
		.filter(Boolean);

	const buckets = ["今天", "本周早些", "更早"]
		.map((name) => ({
			name,
			items: orderedWs.filter((w) => bucketOf(w.time) === name),
		}))
		.filter((b) => b.items.length > 0);

	return (
		<div className="chrome">
			<div className="chrome-header">
				<div className="traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="chrome-address">timeline · {activeWs?.branch}</div>
				<div style={{ width: 48 }} />
			</div>
			<div className="chrome-body">
				<div className="v5">
					<div className="v5-head">
						<div className="v5-head-title">
							<span
								style={{
									width: 8,
									height: 8,
									borderRadius: 3,
									background:
										"linear-gradient(135deg, var(--highlight-2), var(--highlight))",
								}}
							/>
							Timeline
						</div>
						<div className="v5-head-actions">
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

					<div className="v5-timeline">
						{buckets.map((b) => (
							<div key={b.name} className="v5-bucket">
								<div className="v5-bucket-label">
									<span>{b.name}</span>
									<span>{b.items.length}</span>
								</div>
								{b.items.map((w) => {
									const p = projects.find((pp) => pp.id === w.projectId);
									return (
										<button
											key={w.id}
											className="v5-node"
											aria-current={w.id === activeWorkspaceId}
											onClick={() => setActiveWorkspaceId(w.id)}
										>
											<span
												className="v5-node-project"
												style={{
													background: `linear-gradient(180deg, ${p.color}, ${p.color2})`,
												}}
											/>
											<span className={`v5-node-dot ${w.status}`} />
											<div className="v5-node-header">
												<span className="v5-node-name">{w.name}</span>
												<span className="v5-node-time">{w.time}</span>
											</div>
											<div className="v5-node-body">
												<span
													className="v5-node-project-tag"
													style={{
														background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
													}}
												>
													{p.initial}
												</span>
												<span className="v5-node-status">{w.statusLabel}</span>
												{w.diff && (
													<span className="v5-node-diff">
														<span className="add">+{w.diff.add}</span>&nbsp;
														<span className="del">−{w.diff.del}</span>
													</span>
												)}
											</div>
										</button>
									);
								})}
							</div>
						))}
					</div>

					<div className="v5-foot">
						<span className="dot" />
						<span>{orderedWs.length} 个 workspace · 按时间</span>
					</div>
				</div>

				<Canvas workspace={activeWs} project={activeProject} />
			</div>
		</div>
	);
}

Object.assign(window, { V5Timeline });
