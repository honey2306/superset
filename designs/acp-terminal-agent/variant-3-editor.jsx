// variant-3-editor.jsx — Modern Editor Chrome (Zed/Warp feel)
// - Warm dark background, rounded panels, subtle shadows
// - Agent chip in header, breadcrumb cwd/branch, action buttons
// - Tool calls as titled cards with kind-specific colored icon
// - Diff has proper hunk header + add/del row backgrounds
// - Permission as elevated warning card with 2-column keyboard grid
// - Composer is a floating rounded box with toolbar row

const V3ModernEditor = () => {
	const _s = window.MOCK_SESSION;
	const timeline = window.MOCK_TIMELINE;

	return (
		<div className="pane v3">
			<div className="v3__hd">
				<div className="agent-chip">
					<span className="dot" />
					<span>Claude Code</span>
					<span
						style={{ color: "var(--v3-muted)", fontWeight: 400, marginLeft: 4 }}
					>
						· Sonnet 4.5
					</span>
				</div>
				<div className="breadcrumb">
					<IconFolder size={12} />
					<span className="b-item">superset</span>
					<span className="sep">›</span>
					<IconBranch size={12} />
					<span className="b-item" style={{ color: "var(--v3-accent)" }}>
						acp-agent-control-plane
					</span>
					<span className="sep">·</span>
					<span style={{ color: "var(--v3-warn)" }}>+9</span>
				</div>
				<div className="head-actions">
					<button type="button" className="head-btn">
						/ commands
					</button>
					<button type="button" className="head-btn">
						⏸ awaiting
					</button>
				</div>
			</div>

			<div className="pane__scroll v3__body">
				<div className="v3-turn">
					<V3Msg author="You" ts="14:32">
						{timeline[0].blocks[0].text}
					</V3Msg>

					<V3Msg author="Thinking" ts="14:32">
						{timeline[1].blocks[0].text}
					</V3Msg>

					<V3Tool
						kind="search"
						title={
							<span>
								Grep <code>"confirmCloseAcpSession"</code>
							</span>
						}
						statusLabel="3 matches"
						statusClass="ok"
					>
						{`V1PanesWorkspace/confirmCloseAcpSession.ts:12
V1PanesWorkspace/useV1PanesWorkspace.tsx:184
V1PanesWorkspace/useV1PanesWorkspace.tsx:210`}
					</V3Tool>

					<V3Tool
						kind="read"
						title={
							<span>
								Read <code>confirmCloseAcpSession.ts</code>
							</span>
						}
						statusLabel="52 lines · 1.2 KB"
						statusClass="ok"
					/>

					<V3Msg author="Claude" ts="14:32">
						{timeline[4].blocks[0].text}
					</V3Msg>

					<div className="v3-plan">
						<div className="v3-plan__hd">
							<IconPlan size={11} /> Plan · 4 items
						</div>
						{timeline[5].entries.map((e, i) => (
							<div
								key={i}
								className={`v3-plan__item ${e.status === "completed" ? "done" : e.status === "in_progress" ? "now" : ""}`}
							>
								<div className="box">
									{e.status === "completed"
										? "✓"
										: e.status === "in_progress"
											? "▸"
											: ""}
								</div>
								<div className="txt" style={{ flex: 1 }}>
									{e.content}
								</div>
								<div
									className={`pri ${e.priority === "high" ? "hi" : e.priority === "medium" ? "md" : "lo"}`}
								>
									{e.priority}
								</div>
							</div>
						))}
					</div>

					<V3Tool
						kind="edit"
						title={
							<span>
								Edit <code>confirmCloseAcpSession.ts</code>
							</span>
						}
						statusLabel="awaiting permission"
						statusClass="run"
					>
						<div className="v3-diff">
							<div className="v3-diff__hd">
								<IconEdit size={11} />
								<span className="p">confirmCloseAcpSession.ts</span>
								<span style={{ marginLeft: "auto" }}>
									<span style={{ color: "var(--v3-ok)" }}>+2</span>
									<span style={{ color: "var(--v3-danger)", marginLeft: 6 }}>
										−2
									</span>
								</span>
							</div>
							<div className="v3-diff__body">
								{timeline[6].diff.hunk.map((h, i) => (
									<div
										key={i}
										className={`diff-line ${h.type === "add" ? "add" : h.type === "del" ? "del" : ""}`}
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
											{h.type === "add" ? "+" : h.type === "del" ? "−" : " "}{" "}
											{h.txt}
										</span>
									</div>
								))}
							</div>
						</div>
					</V3Tool>

					<div className="v3-perm">
						<div className="v3-perm__hd">
							<IconShield size={12} />
							Permission required · Edit
						</div>
						<div className="v3-perm__q">
							Allow Claude to edit <code>confirmCloseAcpSession.ts</code>?
						</div>
						<div className="v3-perm__opts">
							{timeline[7].options.map((o) => (
								<button type="button" className="v3-perm__opt" key={o.optionId}>
									<span className="k">[{o.keybind}]</span>
									<span>{o.name}</span>
								</button>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="v3__composer">
				<div className="box">
					<textarea
						rows="1"
						placeholder="Reply, or type / for commands, @ to reference a file"
					/>
					<div className="toolbar">
						<span>@ files</span>
						<span>· / commands</span>
						<span>· ⇧⏎ newline</span>
						<span className="spacer" />
						<span>plan mode</span>
						<button type="button" className="send-btn">
							Send ⏎
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

const V3Msg = ({ role, author, ts, children }) => (
	<div className={`v3-msg v3-msg--${role}`}>
		<div className="v3-msg__avatar">
			{role === "user" ? "Y" : role === "thought" ? "✻" : "C"}
		</div>
		<div className="v3-msg__body">
			<div className="v3-msg__author">
				<b>{author}</b> · {ts}
			</div>
			<div className="v3-msg__content">{children}</div>
		</div>
	</div>
);

const V3Tool = ({ kind, title, statusLabel, statusClass, children }) => (
	<div className={`v3-tool kind-${kind}`}>
		<div className="v3-tool__hd">
			<div className="v3-tool__ic">
				<ToolKindIcon kind={kind} size={13} />
			</div>
			<div className="v3-tool__title">{title}</div>
			<div className={`v3-tool__status ${statusClass}`}>
				<span className="dot" />
				<span>{statusLabel}</span>
			</div>
		</div>
		{children && (
			<div className="v3-tool__body">
				{typeof children === "string" ? <pre>{children}</pre> : children}
			</div>
		)}
	</div>
);

Object.assign(window, { V3ModernEditor });
