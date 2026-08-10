// fusion-main.jsx — 主推融合方案
// 03 骨架(agent chip / breadcrumb / kind-colored tool cards / diff hunks / plan checkbox)
// + 02 密度(底部 status line / slim rail category filter / item type letter)
// + 独有配色(warm dark #161719 / amber #f0b429 / teal #5eead4)

const FusionMain = () => {
	const _s = window.MOCK_SESSION;
	const timeline = window.MOCK_TIMELINE;

	return (
		<div className="pane fu">
			{/* Slim 32px rail — category filter / jump anchors */}
			<div className="fu__rail">
				<div className="r-item active" title="Timeline">
					<IconTerminal size={12} />
				</div>
				<div className="r-item" title="Plan (1 in progress)">
					<IconPlan size={12} />
					<span className="r-count">1</span>
				</div>
				<div className="r-item" title="Tool calls">
					<IconEdit size={12} />
				</div>
				<div className="r-item" title="Files touched (3)">
					<IconFolder size={12} />
				</div>
				<div className="r-item" title="Permissions (1)">
					<IconShield size={12} />
					<span className="r-count" style={{ background: "#f0b429" }}>
						!
					</span>
				</div>
				<div className="spacer" />
				<div className="r-item" title="Commands">
					<span style={{ fontFamily: "var(--font-mono)" }}>/</span>
				</div>
			</div>

			{/* Header — agent chip + breadcrumb + actions */}
			<div className="fu__hd">
				<div className="fu-chip">
					<span className="dot" />
					<span>Claude Code</span>
					<span className="sep">·</span>
					<span className="sub">Sonnet 4.5</span>
				</div>
				<div className="fu-crumb">
					<IconFolder size={11} />
					<span className="b">superset</span>
					<span className="sep">›</span>
					<IconBranch size={11} />
					<span className="branch">feat/acp-agent-control-plane</span>
					<span className="sep">·</span>
					<span className="dirty">+9</span>
				</div>
				<div className="actions">
					<button type="button" className="head-btn">
						<span style={{ color: "var(--fu-amber)" }}>/</span> commands
					</button>
					<button type="button" className="head-btn awaiting">
						<span style={{ marginRight: 2 }}>⏸</span> awaiting permission
					</button>
				</div>
			</div>

			{/* Body — timeline */}
			<div className="pane__scroll fu__body">
				<div className="fu-turn">
					<FuMsg name="You" ts="14:32:07">
						{timeline[0].blocks[0].text}
					</FuMsg>

					<FuMsg name="Thinking" ts="14:32:09">
						{timeline[1].blocks[0].text}
					</FuMsg>

					<FuTool
						kind="search"
						title={
							<span>
								<code>grep</code> "confirmCloseAcpSession"
							</span>
						}
						meta="✓ 3 matches · 148ms"
						metaClass="ok"
						body={
							<pre>{`V1PanesWorkspace/confirmCloseAcpSession.ts:12
V1PanesWorkspace/useV1PanesWorkspace.tsx:184
V1PanesWorkspace/useV1PanesWorkspace.tsx:210`}</pre>
						}
						footer={
							<>
								<span>
									scoped <span className="b">V1PanesWorkspace/</span>
								</span>
								<span style={{ marginLeft: "auto" }} className="auto">
									✓ auto-approved (read-only)
								</span>
							</>
						}
					/>

					<FuTool
						kind="read"
						title={
							<span>
								Read <code>confirmCloseAcpSession.ts</code>
							</span>
						}
						meta="✓ 52 lines · 1.2 KB · 82ms"
						metaClass="ok"
					/>

					<FuMsg name="Claude" ts="14:32:24">
						{timeline[4].blocks[0].text}
					</FuMsg>

					<div className="fu-plan">
						<div className="fu-plan__hd">
							<IconPlan size={11} />
							<span>Plan</span>
							<span className="prog">1 / 4 in progress</span>
						</div>
						{timeline[5].entries.map((e, i) => (
							<div
								key={i}
								className={`fu-plan__item ${e.status === "completed" ? "done" : e.status === "in_progress" ? "now" : ""}`}
							>
								<div className="box">
									{e.status === "completed"
										? "✓"
										: e.status === "in_progress"
											? "▸"
											: ""}
								</div>
								<div className="txt">{e.content}</div>
								<div
									className={`pri ${e.priority === "high" ? "hi" : e.priority === "medium" ? "md" : "lo"}`}
								>
									{e.priority}
								</div>
							</div>
						))}
					</div>

					<FuTool
						kind="edit"
						title={
							<span>
								Edit <code>confirmCloseAcpSession.ts</code> · L17-L20
							</span>
						}
						meta="⏸ blocked on permission"
						metaClass="warn"
						diff={timeline[6].diff}
					/>

					<div className="fu-perm">
						<div className="fu-perm__hd">
							<span className="pulse" />
							Permission required · Edit
						</div>
						<div className="fu-perm__q">
							Claude 想编辑 <code>confirmCloseAcpSession.ts</code> —— 2
							处替换,+2 −2 行。
						</div>
						<div className="fu-perm__opts">
							{timeline[7].options.map((o) => (
								<button type="button" className="fu-perm__opt" key={o.optionId}>
									<span className="k">{o.keybind}</span>
									<span>{o.name}</span>
									<span className="kd">{o.hint}</span>
								</button>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Composer — 03 style rounded box + toolbar */}
			<div className="fu__composer">
				<div className="box">
					<div className="prompt-row">
						<span className="glyph">›</span>
						<textarea
							rows="1"
							placeholder="回复 Claude · 输入 / 打开命令 · @ 引用文件"
						/>
					</div>
					<div className="toolbar">
						<span>
							<span className="slash">/</span> commands
						</span>
						<span>·</span>
						<span>
							<span className="at">@</span> files
						</span>
						<span>·</span>
						<span>⇧⏎ newline</span>
						<span className="spacer" />
						<span>1/2/3/4 → permission</span>
						<button type="button" className="send-btn">
							SEND ⏎
						</button>
					</div>
				</div>
			</div>

			{/* Status line — 02 spirit, single row bottom */}
			<div className="fu__status">
				<span className="seg mode">DEFAULT</span>
				<span className="seg">
					<span className="k">sonnet-4.5</span>
				</span>
				<span className="seg">
					<span className="k">62.8k</span>
					<div className="bar">
						<div className="bar__fill" style={{ width: "31%" }} />
					</div>
					<span>200k</span>
				</span>
				<span className="seg cost">
					<span>$0.14</span>
				</span>
				<span className="spacer" />
				<span className="seg branch">
					<IconBranch size={10} /> feat/acp-agent-control-plane
				</span>
				<span className="seg" style={{ color: "var(--fu-amber)" }}>
					+9
				</span>
				<span className="seg conn">
					<IconDot size={5} /> streaming
				</span>
			</div>
		</div>
	);
};

const FuMsg = ({ role, name, ts, children }) => (
	<div className={`fu-msg fu-msg--${role}`}>
		<div className="fu-msg__avatar">
			{role === "user" ? "Y" : role === "thought" ? "✻" : "C"}
		</div>
		<div className="fu-msg__body">
			<div className="fu-msg__head">
				<span className="name">{name}</span>
				<span className="ts">{ts}</span>
			</div>
			<div className="fu-msg__content">{children}</div>
		</div>
	</div>
);

const FuTool = ({ kind, title, meta, metaClass, body, footer, diff }) => (
	<div className={`fu-tool kind-${kind}`}>
		<div className="fu-tool__hd">
			<div className="fu-tool__ic">
				<ToolKindIcon kind={kind} size={12} />
			</div>
			<div className="fu-tool__kind">{kind}</div>
			<div className="fu-tool__title">{title}</div>
			<div className={`fu-tool__meta ${metaClass || ""}`}>
				{(metaClass === "warn" || metaClass === "ok") && (
					<span className="dot" />
				)}
				<span>{meta}</span>
			</div>
		</div>
		{body && <div className="fu-tool__body">{body}</div>}
		{diff && (
			<div className="fu-diff">
				<div className="fu-diff__hd">
					<IconEdit size={10} />
					<span className="p">{diff.path}</span>
					<span className="stat">
						<span className="plus">+{diff.stats.plus}</span>{" "}
						<span className="minus">−{diff.stats.minus}</span>
					</span>
				</div>
				<div className="fu-diff__body">
					{diff.hunk.map((h, i) => (
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
		)}
		{footer && <div className="fu-tool__foot">{footer}</div>}
	</div>
);

Object.assign(window, { FusionMain, FuMsg, FuTool });
