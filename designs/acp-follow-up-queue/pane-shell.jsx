// pane-shell.jsx — 复用的 pane 头/时间线/状态条，用来把三种变体嵌进同样的骨架里
const { useEffect, useRef } = React;

function PaneHeader({ subtitle }) {
	return (
		<div
			className="acp-pane__header"
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "8px 14px",
				borderBottom: "1px solid var(--acp-line)",
				background: "#21222c",
			}}
		>
			<span className="acp-pane__chip" style={{ animation: "none" }}>
				<span className="acp-pane__chip-dot" />
				CLAUDE · SONNET 5
			</span>
			<span
				style={{
					color: "var(--acp-muted)",
					fontSize: 11,
					letterSpacing: "0.03em",
					flex: 1,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{subtitle}
			</span>
			<span className="acp-pane__header-pill" data-status="running">
				● RUNNING
			</span>
		</div>
	);
}

function ConversationBody() {
	const ref = useRef(null);
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, []);
	return (
		<div className="acp-pane__body" ref={ref}>
			<div
				className="acp-pane__body-inner"
				style={{ padding: "14px 16px 20px", gap: 14 }}
			>
				{CONVERSATION.map((m, i) => (
					<div key={i} className={`pane-mock__msg pane-mock__msg--${m.role}`}>
						<span className={`pane-mock__role pane-mock__role--${m.role}`}>
							{m.role === "user" ? "> USER" : "★ ASSISTANT"}
						</span>
						<span>
							{m.body}
							{m.streaming ? <span className="pane-mock__cursor" /> : null}
						</span>
						{m.streaming ? (
							<span className="pane-mock__streaming">STREAMING</span>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

function StatusBar({ queuedCount = 0 }) {
	return (
		<div className="acp-status-bar">
			<span className="acp-status-bar__mode">DEFAULT</span>
			<span className="acp-status-bar__seg">
				token
				<span className="acp-status-bar__seg-value">18.4k / 200k</span>
			</span>
			<span className="acp-status-bar__seg">
				elapsed
				<span className="acp-status-bar__seg-value">02:14</span>
			</span>
			<span
				className="acp-status-bar__seg"
				style={{
					color: queuedCount > 0 ? "var(--acp-cyan)" : "var(--acp-muted)",
				}}
			>
				queue
				<span
					className="acp-status-bar__seg-value"
					style={{ color: queuedCount > 0 ? "var(--acp-cyan)" : undefined }}
				>
					{queuedCount} pending
				</span>
			</span>
			<span style={{ flex: 1 }} />
			<span className="acp-status-bar__seg">↑ ↓ 历史 · ⌘K 命令</span>
		</div>
	);
}

Object.assign(window, { PaneHeader, ConversationBody, StatusBar });
