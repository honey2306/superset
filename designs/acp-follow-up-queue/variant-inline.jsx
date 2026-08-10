// variant-inline.jsx — 变体 A：composer 内联队列（能力感知版）
//
// 两条正交能力，UI 都要感知：
//   [追加发送]  全 adapter 支持，但队列宿主不同：
//     · codex   → host 层维护（adapter 只有单 turn slot）
//     · claude  → Claude adapter 原生 turnQueue
//     · pi      → Pi adapter 原生 turnQueue（并回吐 queueDepth）
//   [立刻发送]  只有 Codex 支持：`turn/interrupt` 打断 + 立即发新 prompt
//     · claude/pi → 按钮灰化
//
// Composer 双按钮：
//   · Queue    (⏎)   追加到队列尾部
//   · Send now (↑)   打断当前 turn，立即发送（仅 Codex）  快捷键 ⌥⏎
// 每条 queue chip 也有独立的 ↑ 立发按钮 + 拖拽把手；顺序通过拖拽调整。

const { useState, useRef } = React;

const ADAPTERS = {
	codex: {
		label: "codex-app-server",
		hint: "queue on host · single turn slot",
		color: "#8be9fd",
		bg: "rgba(139, 233, 253, 0.12)",
		border: "rgba(139, 233, 253, 0.45)",
		canInterrupt: true,
	},
	claude: {
		label: "claude-agent-acp",
		hint: "adapter turnQueue · native",
		color: "#ff79c6",
		bg: "rgba(255, 121, 198, 0.12)",
		border: "rgba(255, 121, 198, 0.45)",
		canInterrupt: false,
	},
	pi: {
		label: "pi-acp",
		hint: "adapter turnQueue · queueDepth meta",
		color: "#bd93f9",
		bg: "rgba(189, 147, 249, 0.14)",
		border: "rgba(189, 147, 249, 0.45)",
		canInterrupt: false,
	},
};

function AdapterBadge({ adapter }) {
	const cfg = ADAPTERS[adapter];
	return (
		<span
			className="fq-adapter-badge"
			title={cfg.hint}
			style={{
				color: cfg.color,
				background: cfg.bg,
				borderColor: cfg.border,
			}}
		>
			{cfg.label}
		</span>
	);
}

function VariantInline() {
	const [queue, setQueue] = useState(QUEUE);
	const [draft, setDraft] = useState(
		"再顺便帮我看一眼 tRPC 那层错误码，别让 renderer 直接吃了。",
	);
	// 演示 adapter 能力开关；用户可以切换看不同 adapter 下的 UI
	const [adapter, setAdapter] = useState("codex");

	// 只有 Codex 的 `turn/interrupt` 能"打断当前 turn 并立即发送新 prompt"
	const canSendNow = ADAPTERS[adapter].canInterrupt;

	// ── Drag & drop 排序 ─────────────────────────────
	const dragIdRef = useRef(null);
	const [dragOverId, setDragOverId] = useState(null);

	const onDragStart = (id) => (e) => {
		dragIdRef.current = id;
		e.dataTransfer.effectAllowed = "move";
		// 需要 setData 才能在部分浏览器里成功启动拖拽
		try {
			e.dataTransfer.setData("text/plain", id);
		} catch (_) {}
	};
	const onDragOver = (id) => (e) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (dragOverId !== id) setDragOverId(id);
	};
	const onDrop = (id) => (e) => {
		e.preventDefault();
		const from = dragIdRef.current;
		dragIdRef.current = null;
		setDragOverId(null);
		if (!from || from === id) return;
		setQueue((q) => {
			const fromIdx = q.findIndex((x) => x.id === from);
			const toIdx = q.findIndex((x) => x.id === id);
			if (fromIdx < 0 || toIdx < 0) return q;
			const next = [...q];
			const [moved] = next.splice(fromIdx, 1);
			next.splice(toIdx, 0, moved);
			return next;
		});
	};
	const onDragEnd = () => {
		dragIdRef.current = null;
		setDragOverId(null);
	};

	const removeAt = (id) => setQueue((q) => q.filter((it) => it.id !== id));

	return (
		<div className="acp-pane fq-pane" style={{ flex: 1 }}>
			<PaneHeader subtitle="acp-composer-migration · desktop worktree" />
			<ConversationBody />

			{queue.length > 0 ? (
				<div className="fq-inline-queue">
					<div className="fq-inline-queue__hd">
						<span className="fq-inline-queue__label">
							<span className="fq-inline-queue__label-glyph">›</span>
							引导队列
						</span>
						<span className="fq-inline-queue__count">
							{queue.length} 条待发
						</span>
					</div>
					<div className="fq-inline-queue__list">
						{queue.map((q, i) => (
							<div
								className={`fq-inline-queue__chip${
									dragOverId === q.id ? " is-drop-target" : ""
								}`}
								key={q.id}
								draggable
								onDragStart={onDragStart(q.id)}
								onDragOver={onDragOver(q.id)}
								onDrop={onDrop(q.id)}
								onDragEnd={onDragEnd}
							>
								<span className="q-chip__grip" aria-hidden="true">
									⋮⋮
								</span>
								<span className="q-chip__idx">
									{String(i + 1).padStart(2, "0")}
								</span>
								<span className="q-chip__text">{q.text}</span>
								<span className="q-chip__actions">
									<button
										className={`q-btn q-btn--send${
											canSendNow ? "" : " is-disabled"
										}`}
										disabled={!canSendNow}
										title={
											canSendNow
												? "打断当前 turn，立即发送该条（仅 codex 支持）"
												: "当前 adapter 不支持 mid-turn 打断，等当前 turn 结束才会按序发出"
										}
									>
										↑
									</button>
									<button className="q-btn" title="编辑">
										✎
									</button>
									<button
										className="q-btn q-btn--danger"
										onClick={() => removeAt(q.id)}
										title="移除"
									>
										×
									</button>
								</span>
							</div>
						))}
					</div>
				</div>
			) : null}

			<div className="acp-pane__composer">
				<div className="acp-pane__composer-box">
					<div className="acp-pane__composer-row">
						<span className="acp-pane__composer-glyph">›</span>
						<textarea
							className="acp-pane__composer-textarea"
							rows={2}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={DRAFT_PLACEHOLDER}
						/>
					</div>
					<div className="acp-pane__composer-toolbar">
						<span className="fq-cap">
							<span className="fq-cap__label">adapter</span>
							<AdapterBadge adapter={adapter} />
							<span className="fq-cap__pills">
								{["codex", "claude", "pi"].map((a) => (
									<button
										key={a}
										className="fq-cap__pill"
										data-active={adapter === a}
										onClick={() => setAdapter(a)}
										title={`切换到 ${a} 视角`}
									>
										{a}
									</button>
								))}
							</span>
						</span>
						<span className="acp-pane__composer-toolbar-spacer" />
						<button className="acp-pane__composer-cancel" type="button">
							Cancel turn
						</button>
						<button
							className="acp-pane__composer-send fq-composer-send--queue"
							type="button"
							title="追加到队列末尾，等当前 turn 结束再发"
						>
							Queue
							<span className="acp-pane__composer-send-kbd">⏎</span>
						</button>
						<button
							className="acp-pane__composer-send fq-composer-send--now"
							type="button"
							disabled={!canSendNow}
							title={
								canSendNow
									? "打断当前 turn 立刻发送（仅 codex 支持）"
									: "该 adapter 不支持 mid-turn 打断"
							}
						>
							↑ Send now
							<span className="acp-pane__composer-send-kbd">⌥⏎</span>
						</button>
					</div>
				</div>
			</div>

			<StatusBar queuedCount={queue.length} />
		</div>
	);
}

Object.assign(window, { VariantInline });
