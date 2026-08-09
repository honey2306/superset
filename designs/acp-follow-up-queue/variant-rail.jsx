// variant-rail.jsx — 变体 B：右侧队列面板
// - 队列作为独立右侧列，与主对话并置；每条 message 是较大的卡片，支持拖拽/编辑
// - composer 底部单一 Send 按钮 + running 状态徽章
// - 更"控制面板化"，适合 debug / power user

const { useState } = React;

function VariantRail() {
	const [queue, setQueue] = useState(QUEUE);
	const [draft, setDraft] = useState("");

	const removeAt = (id) => setQueue((q) => q.filter((it) => it.id !== id));

	return (
		<div className="acp-pane fq-pane fq-pane--rail" style={{ flex: 1 }}>
			<PaneHeader subtitle="acp-composer-migration · desktop worktree" />

			<div className="fq-rail-body">
				<div className="fq-rail-body__main">
					<ConversationBody />
				</div>
				<aside className="fq-rail">
					<div className="fq-rail__hd">
						<span className="fq-rail__title">Follow-up queue</span>
						<span className="fq-rail__count">{queue.length} pending</span>
					</div>
					<div className="fq-rail__desc">
						当前回复完成后，按顺序自动发送 · 拖拽调整顺序 · 双击编辑
					</div>
					<div className="fq-rail__scroll">
						{queue.map((q, i) => (
							<div className="fq-rail__card" key={q.id}>
								<div className="fq-rail__card-hd">
									<span className="fq-rail__card-idx">
										{String(i + 1).padStart(2, "0")}
									</span>
									<span className="fq-rail__card-status">queued</span>
									<span className="fq-rail__card-actions">
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
								<div className="fq-rail__card-body">{q.text}</div>
							</div>
						))}
						{queue.length === 0 ? (
							<div className="fq-rail__empty">
								还没有排队的消息 · 按 <kbd>⌘⏎</kbd> 追加下一条
							</div>
						) : null}
					</div>
					<div className="fq-rail__ft">
						<button className="fq-rail__btn fq-rail__btn--danger">
							Clear all
						</button>
						<button className="fq-rail__btn">Skip next turn</button>
					</div>
				</aside>
			</div>

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
						<span className="acp-pane__composer-toolbar-hint">
							<span className="slash">/</span> command
						</span>
						<span className="acp-pane__composer-toolbar-hint">
							<span className="at">@</span> file
						</span>
						<span className="acp-pane__composer-toolbar-spacer" />
						<span
							className="fq-rail__pill"
							title="正在流式输出，回车会追加到队列"
						>
							● streaming · 追加到队列
						</span>
						<button className="acp-pane__composer-send" type="button">
							Send
							<span className="acp-pane__composer-send-kbd">⌘⏎</span>
						</button>
					</div>
				</div>
			</div>

			<StatusBar queuedCount={queue.length} />
		</div>
	);
}

Object.assign(window, { VariantRail });
