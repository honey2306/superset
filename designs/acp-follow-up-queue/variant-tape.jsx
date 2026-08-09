// variant-tape.jsx — 变体 C：时间线底部横向 tape
// - 队列以"传送带"形式贴在 composer 上沿，chip 之间用连接符表现"依次执行"
// - composer 保持最简：Enter 直接排队，Cancel 独立按钮
// - 更"电影胶片式"，强调下一次输入将从左端进入 timeline

const { useState } = React;

function VariantTape() {
	const [queue, setQueue] = useState(QUEUE);
	const [draft, setDraft] = useState("同时准备一份 changelog 草稿。");
	const removeAt = (id) => setQueue((q) => q.filter((it) => it.id !== id));

	return (
		<div className="acp-pane fq-pane" style={{ flex: 1 }}>
			<PaneHeader subtitle="acp-composer-migration · desktop worktree" />
			<ConversationBody />

			<div className="fq-tape">
				<div className="fq-tape__legend">
					<span className="fq-tape__now">
						<span className="fq-tape__now-dot" />
						NOW streaming
					</span>
					<span className="fq-tape__arrow">›</span>
					<span className="fq-tape__label">
						UP NEXT · {queue.length} queued
					</span>
				</div>
				<div className="fq-tape__strip">
					<div className="fq-tape__now-cell">
						<span className="fq-tape__now-text">
							Turn #4 · 读取 acp-session-client.ts
						</span>
					</div>
					{queue.map((q, i) => (
						<React.Fragment key={q.id}>
							<span className="fq-tape__connector">→</span>
							<div className="fq-tape__cell" data-turn={i + 5}>
								<span className="fq-tape__cell-idx">#{i + 5}</span>
								<span className="fq-tape__cell-text">{q.text}</span>
								<button
									className="fq-tape__cell-close"
									onClick={() => removeAt(q.id)}
									title="移除"
								>
									×
								</button>
							</div>
						</React.Fragment>
					))}
					<span className="fq-tape__connector">→</span>
					<div className="fq-tape__cell fq-tape__cell--drop">
						<span className="fq-tape__cell-idx">#{5 + queue.length}</span>
						<span className="fq-tape__drop-text">
							在下方 composer 输入将追加到这里
						</span>
					</div>
				</div>
			</div>

			<div className="acp-pane__composer">
				<div className="acp-pane__composer-box">
					<div className="acp-pane__composer-row">
						<span className="acp-pane__composer-glyph">›</span>
						<textarea
							className="acp-pane__composer-textarea"
							rows={1}
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
						<span className="acp-pane__composer-toolbar-hint">
							<span className="kbd">⌥⏎</span> 立刻打断并发送
						</span>
						<span className="acp-pane__composer-toolbar-spacer" />
						<button className="acp-pane__composer-cancel" type="button">
							Cancel turn
						</button>
						<button className="acp-pane__composer-send" type="button">
							Append
							<span className="acp-pane__composer-send-kbd">⏎</span>
						</button>
					</div>
				</div>
			</div>

			<StatusBar queuedCount={queue.length} />
		</div>
	);
}

Object.assign(window, { VariantTape });
