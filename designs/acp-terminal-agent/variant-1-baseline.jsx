// variant-1-baseline.jsx — Baseline Terminal (Claude Code faithful)
// - Monochrome + thin dividers, box-drawing style
// - Message layout mirrors CLI transcripts: gutter marker (▐ ⏺ ●) + body with left rule
// - Tools shown as prefixed "▐ Tool" lines with 2-line output
// - No panels/rails; single vertical column. Warm accent only on Claude glyph.

const V1BaselineTerminal = () => {
	const s = window.MOCK_SESSION;
	const timeline = window.MOCK_TIMELINE;

	return (
		<div className="pane v1">
			<div className="v1__head">
				<span className="v1__logo">◆ claude</span>
				<span className="dim">·</span>
				<span className="v1__title truncate">{s.branch}</span>
				<span className="v1__meta">
					sonnet · {s.usage.used.toLocaleString()}/{(s.usage.size / 1000) | 0}k
				</span>
				<span className="v1__meta blink" data-status="awaiting">
					● awaiting
				</span>
			</div>

			<div className="pane__scroll v1__body">
				{/* User message */}
				<V1Message ts="14:32:07">{timeline[0].blocks[0].text}</V1Message>

				{/* Thought */}
				<V1Message ts="14:32:09">
					<span className="mono">✻ </span>
					{timeline[1].blocks[0].text}
				</V1Message>

				{/* Tool call: search */}
				<V1Tool
					name="Grep"
					arg={`"${timeline[2].args}"`}
					status="✓"
					statusClass="status-ok"
					output={[
						"3 matches in 2 files",
						"  V1PanesWorkspace/confirmCloseAcpSession.ts:12",
						"  V1PanesWorkspace/useV1PanesWorkspace.tsx:184",
						"  V1PanesWorkspace/useV1PanesWorkspace.tsx:210",
					]}
				/>

				{/* Tool call: read */}
				<V1Tool
					name="Read"
					arg="V1PanesWorkspace/confirmCloseAcpSession.ts"
					status="✓ 52 lines"
					statusClass="status-ok"
				/>

				{/* Assistant */}
				<V1Message ts="14:32:24">{timeline[4].blocks[0].text}</V1Message>

				{/* Plan */}
				<div className="v1-plan">
					<div className="v1-plan__hd">── Plan ──</div>
					{timeline[5].entries.map((e, i) => (
						<div
							key={i}
							className={`v1-plan__item ${e.status === "completed" ? "done" : e.status === "in_progress" ? "now" : ""}`}
						>
							<span className="box">
								{e.status === "completed"
									? "[x]"
									: e.status === "in_progress"
										? "[▸]"
										: "[ ]"}
							</span>
							<span className="txt">{e.content}</span>
						</div>
					))}
				</div>

				{/* Tool call: edit awaiting permission */}
				<V1Tool
					name="Edit"
					arg="confirmCloseAcpSession.ts"
					status="⏸ awaiting permission"
					statusClass="status-run"
					diff={timeline[6].diff}
				/>

				{/* Permission block */}
				<div className="v1__perm">
					<h5>▐ Permission required</h5>
					<div className="desc">
						Claude wants to edit{" "}
						<span className="mono">confirmCloseAcpSession.ts</span>
					</div>
					<div className="opts">
						<button type="button" className="primary">
							[1] Allow once
						</button>
						<button type="button">[2] Allow always</button>
						<button type="button">[3] Reject</button>
						<button type="button">[4] Never</button>
					</div>
				</div>
			</div>

			<div className="v1__composer">
				<div className="input-row">
					<span className="prompt">›</span>
					<textarea rows="1" placeholder="Reply to Claude…" defaultValue="" />
				</div>
				<div className="hint">
					<span>Enter to send</span>
					<span>Shift+Enter newline</span>
					<span>/ commands</span>
					<span>Esc cancel</span>
				</div>
			</div>
		</div>
	);
};

const V1Message = ({ role, ts, children }) => {
	const marker = role === "user" ? "❯" : role === "thought" ? "✻" : "⏺";
	const label =
		role === "user" ? "You" : role === "thought" ? "Thinking" : "Claude";
	return (
		<div className={`v1-msg v1-msg--${role}`}>
			<div className="v1-msg__gutter">
				<span>{marker}</span>
				<span>{label}</span>
				<span className="dim">{ts}</span>
			</div>
			<div className="v1-msg__body">{children}</div>
		</div>
	);
};

const V1Tool = ({ name, arg, status, statusClass, output, diff }) => (
	<div className={`v1-tool ${statusClass || ""}`}>
		<div className="v1-tool__hd">
			<span>▐</span>
			<span className="v1-tool__name">{name}</span>
			<span className="v1-tool__arg">({arg})</span>
			<span className="v1-tool__status">{status}</span>
		</div>
		{output && <div className="v1-tool__out">{output.join("\n")}</div>}
		{diff && (
			<div className="v1-diff-box">
				{diff.hunk.map((h, i) => (
					<div key={i} className="diff-line">
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
							{h.type === "add" ? "+" : h.type === "del" ? "-" : " "} {h.txt}
						</span>
					</div>
				))}
			</div>
		)}
	</div>
);

Object.assign(window, { V1BaselineTerminal });
