// V2 — Focus / Accordion
// 只有当前项目展开,其他项目压成 40px 的细条。
// 强大的呼吸感,每次只处理一个项目的心智。
// 减压重点:workspace 行的 PR/branch/diff 全部收进"元信息"一行,主行只留名字 + 主色状态。

function V2Focus() {
	const [expandedId, setExpandedId] = React.useState("superset");
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState("ws-acp-agent");

	const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
	const activeProject = projects.find((p) => p.id === activeWs?.projectId);

	return (
		<div className="chrome">
			<div className="chrome-header">
				<div className="traffic">
					<span />
					<span />
					<span />
				</div>
				<div className="chrome-address">
					superset · {activeProject?.name} · {activeWs?.branch}
				</div>
				<div style={{ width: 48 }} />
			</div>
			<div className="chrome-body">
				<div className="v2">
					<div className="v2-workspace-brand">
						<div className="v2-workspace-brand-title">
							<span
								className="v2-brand-dot"
								style={{
									background:
										"linear-gradient(135deg, var(--highlight-2), var(--highlight))",
								}}
							/>
							<strong>My Workspaces</strong>
						</div>
						<div className="v2-brand-actions">
							<button title="搜索 ⌘P">
								<IconSearch size={14} />
							</button>
							<button title="新建">
								<IconPlus size={14} />
							</button>
						</div>
					</div>

					{projects.map((p) => {
						const isExpanded = p.id === expandedId;
						const projectWs = workspaces.filter((w) => w.projectId === p.id);
						const running = projectWs.filter(
							(w) => w.status === "running",
						).length;
						const attention = projectWs.filter(
							(w) => w.status === "attention",
						).length;

						return (
							<div
								key={p.id}
								className={`v2-project ${isExpanded ? "expanded" : "collapsed"}`}
							>
								<button
									className="v2-project-head"
									onClick={() => setExpandedId(isExpanded ? null : p.id)}
								>
									<span
										className="v2-project-swatch"
										style={{
											background: `linear-gradient(135deg, ${p.color}, ${p.color2})`,
										}}
									>
										{isExpanded ? p.initial : ""}
									</span>
									<span className="v2-project-name">{p.name}</span>
									{isExpanded ? (
										<span className="v2-project-summary">
											{running > 0 && <span className="pulse" />}
											{projectWs.length}
										</span>
									) : (
										<span
											className="v2-project-summary"
											style={{ opacity: 0.75 }}
										>
											{running > 0 && <span className="pulse" />}
											{attention > 0 && (
												<span style={{ color: "var(--warning)" }}>
													{attention}!
												</span>
											)}
											<span>{projectWs.length}</span>
										</span>
									)}
								</button>

								{isExpanded && (
									<div className="v2-project-body">
										{projectWs.map((ws) => (
											<V2Ws
												key={ws.id}
												ws={ws}
												isActive={ws.id === activeWorkspaceId}
												onClick={() => setActiveWorkspaceId(ws.id)}
											/>
										))}
										<button className="v2-add-ws">
											<IconPlus size={12} /> 新建 workspace
										</button>
									</div>
								)}
							</div>
						);
					})}
				</div>

				<Canvas workspace={activeWs} project={activeProject} />
			</div>
		</div>
	);
}

function V2Ws({ ws, isActive, onClick }) {
	return (
		<button className="v2-ws" aria-current={isActive} onClick={onClick}>
			<span
				className={`v2-ws-marker ${ws.status} ${ws.type === "branch" ? "local" : ""}`}
			/>
			<div className="v2-ws-body">
				<div className="v2-ws-line">
					<span className="v2-ws-name">{ws.name}</span>
					{ws.diff && (
						<span className="v2-ws-diff">
							<span className="add">+{ws.diff.add}</span>
							&nbsp;
							<span className="del">−{ws.diff.del}</span>
						</span>
					)}
				</div>
				<div className="v2-ws-meta">
					<span>{ws.statusLabel}</span>
					{ws.pr && (
						<>
							<span className="sep" />
							<span className="v2-ws-pr">PR #{ws.pr.number}</span>
						</>
					)}
				</div>
			</div>
		</button>
	);
}

Object.assign(window, { V2Focus });
