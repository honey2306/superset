// variant-2-tui.jsx — Split TUI (OpenCode-inspired)
// - Narrow left gutter with kind badges + counts (msg/tool/plan/perm)
// - Middle timeline with item-side type letter
// - Bottom vim-like status line: mode | model | tokens | cwd | branch | conn
// - Phosphor green accent (#00d4a0) for TUI feel

const V2SplitTUI = () => {
	const s = window.MOCK_SESSION;
	const timeline = window.MOCK_TIMELINE;

	return (
		<div className="pane v2">
			{/* Gutter */}
			<div className="v2__gutter">
				<div className="g-item active" title="Timeline">
					<IconTerminal size={14} />
				</div>
				<div className="g-item" title="Plan">
					<IconPlan size={14} />
				</div>
				<div className="g-item" title="Files touched">
					<IconFolder size={14} />
				</div>
				<div className="g-item" title="Permissions">
					<IconShield size={14} />
				</div>
				<div className="g-item" title="Commands">
					<span style={{ fontFamily: "var(--font-mono)" }}>/</span>
				</div>
				<div style={{ flex: 1 }} />
				<div className="g-count">4</div>
			</div>

			{/* Main content */}
			<div className="v2__main">
				<div className="v2__hd">
					<IconFolder size={12} />
					<span className="cwd">superset</span>
					<span className="dot">·</span>
					<IconBranch size={12} />
					<span className="branch truncate" style={{ maxWidth: 240 }}>
						{s.branch}
					</span>
					<span className="dot">·</span>
					<span>
						+9 <span className="dim">changes</span>
					</span>
					<span
						style={{ marginLeft: "auto" }}
						className="blink"
						data-status="awaiting"
					>
						⏸ awaiting permission
					</span>
				</div>

				<div className="pane__scroll v2__body">
					<V2Item side="U" kind="user">
						<div className="v2-item__lbl">You · 14:32:07</div>
						<div className="v2-msg v2-msg--user">
							{timeline[0].blocks[0].text}
						</div>
					</V2Item>

					<V2Item side="✻" kind="thought">
						<div className="v2-item__lbl">Thinking · 14:32:09</div>
						<div
							className="v2-msg"
							style={{ color: "var(--v2-muted)", fontStyle: "italic" }}
						>
							{timeline[1].blocks[0].text}
						</div>
					</V2Item>

					<V2Item side="⚙" kind="tool">
						<div className="v2-tool">
							<div className="v2-tool__hd">
								<span className="v2-tool__kind">grep</span>
								<span className="v2-tool__title">"confirmCloseAcpSession"</span>
								<span className="v2-tool__loc">in V1PanesWorkspace/</span>
								<span
									className="v2-tool__status"
									style={{ color: "var(--v2-accent)" }}
								>
									✓ 3 matches
								</span>
							</div>
							<div className="v2-tool__body">
								{`confirmCloseAcpSession.ts:12
useV1PanesWorkspace.tsx:184
useV1PanesWorkspace.tsx:210`}
							</div>
						</div>
					</V2Item>

					<V2Item side="⚙" kind="tool">
						<div className="v2-tool">
							<div className="v2-tool__hd">
								<span className="v2-tool__kind">read</span>
								<span className="v2-tool__title">
									confirmCloseAcpSession.ts
								</span>
								<span className="v2-tool__loc">52 lines</span>
								<span
									className="v2-tool__status"
									style={{ color: "var(--v2-accent)" }}
								>
									✓ done
								</span>
							</div>
						</div>
					</V2Item>

					<V2Item side="A" kind="agent">
						<div className="v2-item__lbl">Claude · 14:32:24</div>
						<div className="v2-msg">{timeline[4].blocks[0].text}</div>
					</V2Item>

					<V2Item side="◧" kind="plan">
						<div className="v2-item__lbl">Plan · 4 steps</div>
						<div className="v2-tool__body" style={{ padding: "8px 10px" }}>
							{timeline[5].entries.map((e, i) => (
								<div
									key={i}
									style={{
										display: "flex",
										gap: 8,
										padding: "2px 0",
										color:
											e.status === "completed"
												? "var(--v2-muted)"
												: e.status === "in_progress"
													? "var(--v2-warn)"
													: "var(--v2-fg)",
										textDecoration:
											e.status === "completed" ? "line-through" : "none",
									}}
								>
									<span
										style={{
											width: 14,
											color:
												e.status === "in_progress"
													? "var(--v2-warn)"
													: e.status === "completed"
														? "var(--v2-accent)"
														: "var(--v2-dim)",
										}}
									>
										{e.status === "completed"
											? "[x]"
											: e.status === "in_progress"
												? "[▸]"
												: "[ ]"}
									</span>
									<span style={{ flex: 1 }}>{e.content}</span>
									<span className="dim" style={{ fontSize: 10.5 }}>
										{e.priority}
									</span>
								</div>
							))}
						</div>
					</V2Item>

					<V2Item side="⚙" kind="tool">
						<div className="v2-tool">
							<div className="v2-tool__hd">
								<span className="v2-tool__kind">edit</span>
								<span className="v2-tool__title">
									confirmCloseAcpSession.ts
								</span>
								<span className="v2-tool__loc">L18</span>
								<span
									className="v2-tool__status"
									style={{ color: "var(--v2-warn)" }}
								>
									⏸ awaiting
								</span>
							</div>
							<div className="v2-tool__body" style={{ padding: 0 }}>
								{timeline[6].diff.hunk.map((h, i) => (
									<div
										key={i}
										className="diff-line"
										style={{ padding: "0 10px" }}
									>
										<span className="ln">{h.ln}</span>
										<span
											className={
												h.type === "add"
													? "diff-add"
													: h.type === "del"
														? "diff-del"
														: "diff-ctx"
											}
										>
											{h.type === "add" ? "+" : h.type === "del" ? "-" : " "}{" "}
											{h.txt}
										</span>
									</div>
								))}
							</div>
						</div>
					</V2Item>

					<V2Item side="!" kind="plan">
						<div className="v2-perm">
							<div className="v2-perm__hd">▲ Permission required</div>
							<div className="v2-perm__q">
								Allow Claude to edit <b>confirmCloseAcpSession.ts</b>?
							</div>
							<div className="v2-perm__opts">
								{timeline[7].options.map((o) => (
									<button
										type="button"
										className="v2-perm__opt"
										key={o.optionId}
									>
										<span className="k">[{o.keybind}]</span>
										<span>{o.name}</span>
										<span className="kd">{o.kind.replace("_", " ")}</span>
									</button>
								))}
							</div>
						</div>
					</V2Item>
				</div>

				<div className="v2__composer">
					<span className="prompt">❯</span>
					<textarea rows="1" placeholder="type / for commands, @ for files…" />
					<span className="send" title="Enter">
						↵
					</span>
				</div>
			</div>

			{/* Status line spans full main column */}
			<div className="v2__status">
				<span className="seg mode">
					<span>DEFAULT</span>
				</span>
				<span className="seg">
					<span className="k">sonnet-4.5</span>
				</span>
				<span className="seg">
					<span>62.8k</span>
					<div className="bar">
						<div className="bar__fill" style={{ width: "31%" }} />
					</div>
					<span>200k</span>
				</span>
				<span className="seg">
					<span>$0.14</span>
				</span>
				<span className="spacer" />
				<span className="seg">
					<IconBranch size={10} />
					<span className="k">{s.branch.slice(0, 32)}…</span>
					<span style={{ color: "var(--v2-warn)" }}>+9</span>
				</span>
				<span className="seg" style={{ color: "var(--v2-accent)" }}>
					<IconDot size={6} />
					<span>streaming</span>
				</span>
			</div>
		</div>
	);
};

const V2Item = ({ side, kind, children }) => (
	<div className={`v2-item v2-item--${kind}`}>
		<div className="v2-item__side">{side}</div>
		<div className="v2-item__body">{children}</div>
	</div>
);

Object.assign(window, { V2SplitTUI });
