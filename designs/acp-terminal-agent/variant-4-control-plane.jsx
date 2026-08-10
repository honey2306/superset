// variant-4-control-plane.jsx — Control Plane Native
// Superset's opinionated take on ACP UI. What sets it apart from Claude/OpenCode:
//   1. Runtime Profile bar as first-class citizen: agent × protocol × model × mode
//      always visible + swappable, materializing the acp-agent-control-plane.md thesis.
//   2. Workspace context strip below (cwd · branch · dirty count · profile name).
//   3. Kind-badge column on every timeline item (U/A/✻/⚙/⧉/▲), machine-scannable.
//   4. Cyan phosphor + amber warn palette — reads as "instrument panel", not "chat".
//   5. Permission card is a hot orange pulsing prompt with 4 explicit keybinds
//      (1=allow-once, 2=allow-always, 3=reject-once, 4=never).
//   6. Composer glyph is `⌘` — /-prefix opens command palette; hint rail below.
//   7. Bottom status bar with turn timer, token usage bar with hard-cap, live cost.

const V4ControlPlane = () => {
	const s = window.MOCK_SESSION;
	const timeline = window.MOCK_TIMELINE;

	return (
		<div className="pane v4">
			{/* Runtime profile bar (top of pane) */}
			<div className="v4__profile">
				<div className="slot agent">
					<span className="lbl">Agent</span>
					<span className="val">
						Claude Code <span className="caret">▾</span>
					</span>
				</div>
				<div className="slot protocol">
					<span className="lbl">Protocol</span>
					<span className="val">
						ACP <span className="caret">▾</span>
					</span>
				</div>
				<div className="slot model">
					<span className="lbl">Model</span>
					<span className="val">
						Sonnet 4.5 <span className="caret">▾</span>
					</span>
				</div>
				<div className="slot mode">
					<span className="lbl">Mode</span>
					<span className="val">
						default <span className="caret">▾</span>
					</span>
				</div>
				<div className="runtime">
					<span className="lbl">Runtime</span>
					<span className="val">
						<span className="dot" />
						local · pid 84321
					</span>
				</div>
			</div>

			{/* Workspace context strip */}
			<div className="v4__ctx">
				<IconFolder size={11} />
				<span className="path">~/Code/superset</span>
				<span className="sep">·</span>
				<span className="branch">
					<IconBranch size={11} /> feat/acp-agent-control-plane
				</span>
				<span className="dirty">+9 uncommitted</span>
				<span className="sep">·</span>
				<span>
					session <span style={{ color: "var(--v4-fg)" }}>acp_01HZR…RWJV1</span>
				</span>
				<span className="prof-name">Profile: Balanced</span>
			</div>

			{/* Timeline body */}
			<div className="pane__scroll v4__body">
				<V4Item badge="U" kind="user">
					<div className="v4-msg v4-msg--user">
						{timeline[0].blocks[0].text}
					</div>
				</V4Item>

				<V4Item badge="✻" kind="think">
					<div className="v4-msg v4-msg--think">
						{timeline[1].blocks[0].text}
					</div>
				</V4Item>

				<V4Item badge="⚙" kind="tool">
					<div className="v4-tool">
						<div className="v4-tool__hd">
							<span className="v4-tool__kind search">search</span>
							<span className="v4-tool__title">
								<code>grep</code> "confirmCloseAcpSession"
							</span>
							<span className="v4-tool__cost">148ms · 3 matches</span>
						</div>
						<div className="v4-tool__body">
							<pre>{`V1PanesWorkspace/confirmCloseAcpSession.ts:12
V1PanesWorkspace/useV1PanesWorkspace.tsx:184
V1PanesWorkspace/useV1PanesWorkspace.tsx:210`}</pre>
						</div>
						<div className="v4-tool__foot">
							<span>
								scoped to <span className="b">V1PanesWorkspace/</span>
							</span>
							<span style={{ marginLeft: "auto", color: "var(--v4-accent)" }}>
								✓ auto-approved (read-only)
							</span>
						</div>
					</div>
				</V4Item>

				<V4Item badge="⚙" kind="tool">
					<div className="v4-tool">
						<div className="v4-tool__hd">
							<span className="v4-tool__kind read">read</span>
							<span className="v4-tool__title">
								<code>confirmCloseAcpSession.ts</code>
							</span>
							<span className="v4-tool__cost">52 lines · 1.2 KB · 82ms</span>
						</div>
					</div>
				</V4Item>

				<V4Item badge="A" kind="agent">
					<div className="v4-msg">{timeline[4].blocks[0].text}</div>
				</V4Item>

				<V4Item badge="◫" kind="plan">
					<div className="v4-plan">
						<div className="v4-plan__hd">▍ Plan · 4 steps · 1 in progress</div>
						{timeline[5].entries.map((e, i) => (
							<div
								key={i}
								className={`v4-plan__item ${e.status === "completed" ? "done" : e.status === "in_progress" ? "now" : ""}`}
							>
								<span className="box">
									{e.status === "completed"
										? "▣"
										: e.status === "in_progress"
											? "▶"
											: "▢"}
								</span>
								<span className="txt" style={{ flex: 1 }}>
									{e.content}
								</span>
								<span className={`pri ${e.priority === "high" ? "hi" : ""}`}>
									{e.priority}
								</span>
							</div>
						))}
					</div>
				</V4Item>

				<V4Item badge="⚙" kind="tool">
					<div className="v4-tool">
						<div className="v4-tool__hd">
							<span className="v4-tool__kind edit">edit</span>
							<span className="v4-tool__title">
								<code>confirmCloseAcpSession.ts</code> · L17-L20
							</span>
							<span
								className="v4-tool__cost"
								style={{ color: "var(--v4-warn)" }}
							>
								⏸ blocked on permission
							</span>
						</div>
						<div className="v4-diff">
							<div className="v4-diff__hd">
								<IconEdit size={11} />
								<span className="p">confirmCloseAcpSession.ts</span>
								<span className="stat">
									<span className="plus">+2</span>{" "}
									<span className="minus">−2</span>
								</span>
							</div>
							<div className="v4-diff__body">
								{timeline[6].diff.hunk.map((h, i) => (
									<div
										key={i}
										className={`diff-line ${h.type === "add" ? "add" : h.type === "del" ? "del" : ""}`}
									>
										<span className="ln">{h.ln}</span>
										<span className="mk">
											{h.type === "add" ? "+" : h.type === "del" ? "−" : " "}
										</span>
										<span
											className={
												h.type === "add"
													? "diff-add"
													: h.type === "del"
														? "diff-del"
														: "diff-ctx"
											}
										>
											{h.txt}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</V4Item>

				<V4Item badge="▲" kind="perm">
					<div className="v4-perm">
						<div className="v4-perm__hd">
							<span className="pulse" />
							Permission required · Edit tool
						</div>
						<div className="v4-perm__q">
							Claude 想编辑 <code>confirmCloseAcpSession.ts</code> — 2 处替换。
						</div>
						<div className="v4-perm__opts">
							{timeline[7].options.map((o) => (
								<button type="button" className="v4-perm__opt" key={o.optionId}>
									<span className="k">{o.keybind}</span>
									<span>{o.name}</span>
									<span className="kd">{o.hint}</span>
								</button>
							))}
						</div>
					</div>
				</V4Item>
			</div>

			{/* Composer */}
			<div className="v4__composer">
				<div className="box">
					<span className="glyph">⌘</span>
					<textarea
						rows="1"
						placeholder="回复 Claude · 输入 / 打开命令 · @ 引用文件"
					/>
					<button type="button" className="send">
						SEND ⏎
					</button>
				</div>
				<div className="rail">
					<span className="slash">/</span>
					<span>model</span>
					<span className="dim">·</span>
					<span className="slash">/</span>
					<span>mode</span>
					<span className="dim">·</span>
					<span className="slash">/</span>
					<span>profile</span>
					<span className="dim">·</span>
					<span>@ 引用文件</span>
					<span className="spacer" />
					<span>1/2/3/4 键盘响应权限</span>
				</div>
			</div>

			{/* Bottom status bar */}
			<div className="v4__status">
				<span className="seg turn">
					<span>TURN</span>
					<span className="k">{s.turnStart}</span>
					<span>{s.turnElapsed}</span>
				</span>
				<span className="seg">
					<span>ctx</span>
					<span className="k">62.8k</span>
				</span>
				<div className="bar">
					<div className="bar__fill" style={{ width: "31%" }} />
				</div>
				<span className="seg">
					<span>/ 200k</span>
				</span>
				<span className="seg">
					<span>cost</span>
					<span className="cost">$0.14</span>
				</span>
				<span className="spacer" />
				<span className="seg">
					<IconDot size={5} />
					<span>streaming</span>
				</span>
				<span className="seg" style={{ color: "var(--v4-accent)" }}>
					<span>native pid 84321</span>
				</span>
			</div>
		</div>
	);
};

const V4Item = ({ badge, kind, children }) => (
	<div className={`v4-item v4-item--${kind}`}>
		<div className="v4-item__badge">{badge}</div>
		<div>{children}</div>
	</div>
);

Object.assign(window, { V4ControlPlane });
