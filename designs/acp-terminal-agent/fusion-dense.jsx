// fusion-dense.jsx — 密度更高的融合版
// - 44px gutter with badge counts (TUI-forward)
// - Tighter tool cards, smaller font-size, more content per screen
// - Same warm dark / amber / teal palette
// - For power users who want a maximum-signal view

const FusionDense = () => {
	const _s = window.MOCK_SESSION;
	const timeline = window.MOCK_TIMELINE;

	return (
		<div className="pane fud">
			{/* Wider 44px gutter with counts */}
			<div className="fud__gutter">
				<div className="g-item active">
					<IconTerminal size={13} />
					<span className="g-count">8</span>
				</div>
				<div className="g-item">
					<IconPlan size={13} />
					<span className="g-count">4</span>
				</div>
				<div className="g-item">
					<IconEdit size={13} />
					<span className="g-count">3</span>
				</div>
				<div className="g-item">
					<IconFolder size={13} />
					<span className="g-count">3</span>
				</div>
				<div className="g-item">
					<IconShield size={13} />
					<span
						className="g-count"
						style={{ background: "#f0b429", color: "#131519" }}
					>
						1
					</span>
				</div>
				<div className="spacer" />
				<div className="g-mini">acp</div>
			</div>

			{/* Header — compact */}
			<div className="fud__hd">
				<div className="chip">
					<span className="dot" />
					<span>Claude</span>
					<span style={{ color: "var(--fu-muted)", marginLeft: 3 }}>
						· sonnet-4.5
					</span>
				</div>
				<span className="sep">·</span>
				<IconFolder size={11} />
				<span className="cwd">~/Code/superset</span>
				<span className="sep">·</span>
				<span className="branch">
					<IconBranch size={10} />
					feat/acp-agent-control-plane
				</span>
				<span style={{ color: "var(--fu-amber)", fontSize: 10 }}>+9</span>
				<div className="actions">
					<button type="button" className="head-btn">
						default ▾
					</button>
					<button type="button" className="head-btn awaiting">
						⏸ awaiting
					</button>
				</div>
			</div>

			{/* Body — tighter, letter-per-row */}
			<div className="pane__scroll fud__body">
				<FudItem type="U" kind="user">
					<div className="fud-lbl">
						<b>You</b> · 14:32:07
					</div>
					<div className="fud-msg fud-msg--user">
						{timeline[0].blocks[0].text}
					</div>
				</FudItem>

				<FudItem type="✻" kind="think">
					<div className="fud-lbl">Thinking · 14:32:09</div>
					<div className="fud-msg fud-msg--think">
						{timeline[1].blocks[0].text}
					</div>
				</FudItem>

				<FudItem type="⚙" kind="tool">
					<FudTool
						kind="search"
						title={
							<span>
								<code>grep</code> "confirmCloseAcpSession" in V1PanesWorkspace/
							</span>
						}
						meta="✓ 3 matches · 148ms"
						body={
							<pre>{`confirmCloseAcpSession.ts:12
useV1PanesWorkspace.tsx:184
useV1PanesWorkspace.tsx:210`}</pre>
						}
					/>
				</FudItem>

				<FudItem type="⚙" kind="tool">
					<FudTool
						kind="read"
						title={
							<span>
								Read <code>confirmCloseAcpSession.ts</code> · 52 lines
							</span>
						}
						meta="✓ 82ms · auto-approved"
					/>
				</FudItem>

				<FudItem type="A" kind="agent">
					<div className="fud-lbl">
						<b>Claude</b> · 14:32:24
					</div>
					<div className="fud-msg">{timeline[4].blocks[0].text}</div>
				</FudItem>

				<FudItem type="◫" kind="plan">
					<div className="fud-plan">
						<div className="fud-plan__hd">▍ Plan · 4 steps · 1 in progress</div>
						{timeline[5].entries.map((e, i) => (
							<div
								key={i}
								className={`fud-plan__item ${e.status === "completed" ? "done" : e.status === "in_progress" ? "now" : ""}`}
							>
								<span className="box">
									{e.status === "completed"
										? "[x]"
										: e.status === "in_progress"
											? "[▸]"
											: "[ ]"}
								</span>
								<span className="txt">{e.content}</span>
								<span className={`pri ${e.priority === "high" ? "hi" : ""}`}>
									{e.priority}
								</span>
							</div>
						))}
					</div>
				</FudItem>

				<FudItem type="⚙" kind="tool">
					<FudTool
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
				</FudItem>

				<FudItem type="▲" kind="perm">
					<div className="fud-perm">
						<div className="fud-perm__hd">
							<span className="pulse" />
							Permission required · Edit
						</div>
						<div className="fud-perm__q">
							Claude 想编辑 <code>confirmCloseAcpSession.ts</code> —— 2 处替换。
						</div>
						<div className="fud-perm__opts">
							{timeline[7].options.map((o) => (
								<button
									type="button"
									className="fud-perm__opt"
									key={o.optionId}
								>
									<span className="k">{o.keybind}</span>
									<span>{o.name}</span>
									<span className="kd">{o.hint}</span>
								</button>
							))}
						</div>
					</div>
				</FudItem>
			</div>

			{/* Composer — single row */}
			<div className="fud__composer">
				<span className="glyph">›</span>
				<textarea rows="1" placeholder="回复 · / 命令 · @ 文件 · ⇧⏎ 换行" />
				<span className="send">⏎</span>
			</div>

			{/* Dense status line */}
			<div className="fud__status">
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
				<span className="seg cost">$0.14</span>
				<span className="spacer" />
				<span className="seg branch">
					<IconBranch size={9} />
					acp-agent-control-plane
				</span>
				<span className="seg" style={{ color: "var(--fu-amber)" }}>
					+9
				</span>
				<span className="seg conn">● streaming</span>
				<span className="seg" style={{ color: "var(--fu-muted)" }}>
					pid 84321
				</span>
			</div>
		</div>
	);
};

const FudItem = ({ type, kind, children }) => (
	<div className={`fud-item fud-item--${kind}`}>
		<div className="fud-item__type">{type}</div>
		<div>{children}</div>
	</div>
);

const FudTool = ({ kind, title, meta, metaClass, body, diff }) => (
	<div className={`fud-tool kind-${kind}`}>
		<div className="fud-tool__hd">
			<span className="fud-tool__kind">{kind}</span>
			<span className="fud-tool__title">{title}</span>
			<span className={`fud-tool__meta ${metaClass || ""}`}>{meta}</span>
		</div>
		{body && <div className="fud-tool__body">{body}</div>}
		{diff && (
			<div className="fud-diff">
				<div className="fud-diff__hd">
					<span className="p">{diff.path}</span>
					<span className="stat">
						<span className="plus">+{diff.stats.plus}</span>{" "}
						<span className="minus">−{diff.stats.minus}</span>
					</span>
				</div>
				<div className="fud-diff__body">
					{diff.hunk.map((h, i) => (
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
								{h.type === "add" ? "+" : h.type === "del" ? "−" : " "} {h.txt}
							</span>
						</div>
					))}
				</div>
			</div>
		)}
	</div>
);

Object.assign(window, { FusionDense, FudItem, FudTool });
