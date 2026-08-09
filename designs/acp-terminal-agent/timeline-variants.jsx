// timeline-variants.jsx — 4 rendering approaches for the conversation timeline
// All share the same mock scenario so differences are 100% design, not content.
const { useState } = React;

// ============================================================
// Shared mock data — one full ACP turn
// ============================================================
const TURN = [
	{
		kind: "message",
		role: "user",
		ts: "14:32:07",
		text: "把 ACP session pane 关闭时的确认提示改成中文,并且区分 running 和 awaiting_permission 两种状态的措辞。",
	},
	{
		kind: "message",
		role: "thought",
		ts: "14:32:09",
		text: "先找一下关闭 pane 的入口逻辑,看看当前是怎么区分 idle / running 的。",
	},
	{
		kind: "tool",
		toolKind: "search",
		title: "grep",
		arg: '"confirmCloseAcpSession"',
		status: "completed",
		meta: "3 matches · 148ms",
		autoApproved: true,
		body: `V1PanesWorkspace/confirmCloseAcpSession.ts:12
V1PanesWorkspace/useV1PanesWorkspace.tsx:184
V1PanesWorkspace/useV1PanesWorkspace.tsx:210`,
	},
	{
		kind: "tool",
		toolKind: "read",
		title: "Read",
		arg: "confirmCloseAcpSession.ts",
		status: "completed",
		meta: "52 lines · 82ms",
		autoApproved: true,
	},
	{
		kind: "message",
		role: "agent",
		ts: "14:32:24",
		text: '拿到了。我准备把两条 English 提示改成:\n- running: "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?"\n- awaiting_permission: "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?"',
	},
	{
		kind: "plan",
		entries: [
			{
				content: "定位所有关闭 pane 的确认入口",
				status: "completed",
				priority: "high",
			},
			{
				content: "改写英文提示为中文,区分 running / awaiting",
				status: "in_progress",
				priority: "high",
			},
			{
				content: "更新对应 pane 测试用例",
				status: "pending",
				priority: "medium",
			},
			{ content: "跑 typecheck + lint", status: "pending", priority: "low" },
		],
	},
	{
		kind: "tool",
		toolKind: "edit",
		title: "Edit",
		arg: "confirmCloseAcpSession.ts · L17-L20",
		status: "pending_permission",
		meta: "blocked on permission",
		diff: {
			path: "confirmCloseAcpSession.ts",
			stats: { plus: 2, minus: 2 },
			hunk: [
				{ type: "ctx", ln: 16, txt: '  if (status === "running") {' },
				{
					type: "del",
					ln: 17,
					txt: '    return "Agent is running. Closing will cancel the current turn. Close anyway?";',
				},
				{
					type: "add",
					ln: 17,
					txt: '    return "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?";',
				},
				{ type: "ctx", ln: 18, txt: "  }" },
			],
		},
	},
	{
		kind: "permission",
		question: "编辑 confirmCloseAcpSession.ts — 2 处替换,+2 −2 行",
		options: [
			{ id: "allow_once", name: "Allow once", hint: "本次", key: "1" },
			{
				id: "allow_always",
				name: "Allow for session",
				hint: "本会话",
				key: "2",
			},
			{ id: "reject_once", name: "Reject once", hint: "本次拒绝", key: "3" },
			{
				id: "reject_always",
				name: "Never for session",
				hint: "永久拒绝",
				key: "4",
			},
		],
	},
];

// ============================================================
// Global page styles
// ============================================================
if (!document.getElementById("tv-shell")) {
	const s = document.createElement("style");
	s.id = "tv-shell";
	s.textContent = `
	*, *::before, *::after { box-sizing: border-box; }
	body {
		margin: 0; background: #191a21;
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}
	.tv-page { min-height: 100vh; display: flex; flex-direction: column; }
	.tv-topbar {
		padding: 12px 32px;
		border-bottom: 1px solid rgba(98,114,164,0.18);
		background: #21222c;
		display: flex; align-items: center; gap: 12px;
		font-size: 13px; color: #d0d3e0;
	}
	.tv-topbar b { color: #ff79c6; font-weight: 500; }
	.tv-topbar .dim { color: #6272a4; font-size: 11.5px; }
	.tv-grid {
		flex: 1; display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 32px; padding: 32px;
	}
	.tv-frame { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
	.tv-frame__head {
		display: flex; align-items: baseline; gap: 10px;
	}
	.tv-frame__num {
		font-size: 10.5px; letter-spacing: 0.14em; color: #6272a4;
	}
	.tv-frame__name {
		color: #f8f8f2; font-size: 15px; font-weight: 500;
	}
	.tv-frame__desc {
		color: #6272a4; font-size: 11.5px;
	}
	.tv-frame__focus {
		margin-left: auto;
		background: transparent; border: 1px solid rgba(255,255,255,0.08);
		color: #6272a4; padding: 3px 10px; border-radius: 3px;
		cursor: pointer; font-size: 11px; font: inherit;
	}
	.tv-frame__focus:hover { color: #f8f8f2; border-color: rgba(255,255,255,0.24); }
	.tv-frame__box {
		background: #282a36;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,121,198,0.06);
		height: 640px;
		display: flex; flex-direction: column;
	}
	.tv-frame__body {
		flex: 1; min-height: 0; overflow-y: auto;
		padding: 16px;
		scrollbar-width: thin;
	}
	.tv-frame__body::-webkit-scrollbar { width: 6px; }
	.tv-frame__body::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 3px; }

	/* ==========================================================
	   VARIANT 2 — Linear / Role dividers
	   ========================================================== */
	.v2 { display: flex; flex-direction: column; gap: 14px; }
	.v2-turn {
		border-left: 3px solid transparent;
		padding: 8px 12px;
		border-radius: 0 4px 4px 0;
	}
	.v2-turn[data-role="user"] {
		border-left-color: #8be9fd;
		background: rgba(139,233,253,0.04);
	}
	.v2-turn[data-role="agent"] {
		border-left-color: #ff79c6;
	}
	.v2-turn[data-role="thought"] {
		border-left-color: #6272a4;
		border-left-style: dashed;
	}
	.v2-turn__role {
		display: inline-block;
		font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
		color: #6272a4; margin-bottom: 6px;
	}
	.v2-turn[data-role="user"] .v2-turn__role { color: #8be9fd; }
	.v2-turn[data-role="agent"] .v2-turn__role { color: #ff79c6; }
	.v2-turn__text {
		color: #f8f8f2; font-size: 13px; line-height: 1.65;
		white-space: pre-wrap;
	}
	.v2-turn[data-role="thought"] .v2-turn__text {
		color: #6272a4; font-style: italic;
	}
	.v2-tool {
		display: flex; align-items: center; gap: 8px;
		padding: 6px 10px;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(98,114,164,0.18);
		border-radius: 4px;
		font-size: 11.5px; color: #d0d3e0;
	}
	.v2-tool__kind {
		font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 1px 6px; border-radius: 2px; font-weight: 500;
		border: 1px solid;
	}
	.v2-tool__kind[data-k="search"] { color: #bd93f9; border-color: rgba(189,147,249,0.35); }
	.v2-tool__kind[data-k="read"] { color: #8be9fd; border-color: rgba(139,233,253,0.35); }
	.v2-tool__kind[data-k="edit"] { color: #ffb86c; border-color: rgba(255,184,108,0.35); }
	.v2-tool__title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.v2-tool__title code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 2px; font-size: 11px; }
	.v2-tool__meta { color: #6272a4; font-size: 10.5px; flex-shrink: 0; }
	.v2-tool__meta[data-warn="true"] { color: #ffb86c; }
	.v2-tool__body {
		padding: 8px 12px 8px 40px;
		background: rgba(0,0,0,0.25);
		border-radius: 0 0 4px 4px;
		border: 1px solid rgba(98,114,164,0.18); border-top: none;
		margin-top: -1px;
		font-size: 11.5px; color: #d0d3e0;
		white-space: pre-wrap;
	}
	.v2-plan {
		border-left: 3px solid #8be9fd;
		background: rgba(139,233,253,0.03);
		padding: 8px 12px;
		border-radius: 0 4px 4px 0;
	}
	.v2-plan__head {
		font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
		color: #8be9fd; margin-bottom: 6px;
	}
	.v2-plan__item { display: flex; gap: 8px; font-size: 12px; padding: 2px 0; align-items: center; }
	.v2-plan__box { width: 14px; height: 14px; border: 1.5px solid #44475a; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 9px; flex-shrink: 0;}
	.v2-plan__item[data-s="completed"] .v2-plan__box { background: #50fa7b; border-color: #50fa7b; color: #282a36; }
	.v2-plan__item[data-s="completed"] .v2-plan__txt { color: #6272a4; text-decoration: line-through; }
	.v2-plan__item[data-s="in_progress"] .v2-plan__box { border-color: #ffb86c; color: #ffb86c; background: rgba(255,184,108,0.14);}
	.v2-plan__item[data-s="in_progress"] .v2-plan__txt { color: #f8f8f2; font-weight: 500; }
	.v2-plan__pri { margin-left: auto; font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; color: #6272a4; padding: 0 5px; border-radius: 2px; background: rgba(98,114,164,0.12); }
	.v2-plan__pri[data-p="high"] { color: #ff5555; background: rgba(255,85,85,0.14); }
	.v2-plan__pri[data-p="medium"] { color: #ffb86c; background: rgba(255,184,108,0.14); }
	.v2-perm {
		border: 1px solid rgba(255,121,198,0.5);
		background: linear-gradient(180deg, rgba(255,121,198,0.12), rgba(255,121,198,0.03));
		border-radius: 6px;
		padding: 12px 14px;
		box-shadow: 0 0 24px rgba(255,121,198,0.1);
	}
	.v2-perm__head { color: #ff79c6; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
	.v2-perm__pulse { width: 6px; height: 6px; border-radius: 50%; background: #ff79c6; animation: acp-pulse-pink 1.6s infinite; }
	.v2-perm__q { color: #f8f8f2; font-size: 12.5px; margin-bottom: 10px; }
	.v2-perm__opts { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
	.v2-perm__opt {
		display: grid; grid-template-columns: 20px 1fr auto; gap: 8px;
		align-items: center; padding: 6px 10px;
		background: rgba(40,42,54,0.7); border: 1px solid rgba(98,114,164,0.28);
		color: #f8f8f2; border-radius: 4px; cursor: pointer;
		font: inherit; font-size: 11.5px; text-align: left;
	}
	.v2-perm__opt:hover { border-color: #ff79c6; }
	.v2-perm__key { color: #ff79c6; font-weight: 600; font-size: 10.5px; text-align: center; border: 1px solid rgba(255,121,198,0.4); border-radius: 2px; padding: 0 4px; }
	.v2-perm__hint { color: #6272a4; font-size: 10px; letter-spacing: 0.06em; }

	/* ==========================================================
	   VARIANT 3 — Chat bubbles
	   ========================================================== */
	.v3 { display: flex; flex-direction: column; gap: 10px; }
	.v3-msg {
		display: flex; flex-direction: column;
	}
	.v3-msg[data-role="user"] {
		align-items: flex-end;
	}
	.v3-msg__author {
		font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
		color: #6272a4; margin-bottom: 4px; padding: 0 4px;
	}
	.v3-msg[data-role="user"] .v3-msg__author { color: #8be9fd; }
	.v3-msg[data-role="agent"] .v3-msg__author { color: #ff79c6; }
	.v3-msg__bubble {
		max-width: 82%;
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 13px; line-height: 1.6; color: #f8f8f2;
		white-space: pre-wrap;
	}
	.v3-msg[data-role="user"] .v3-msg__bubble {
		background: rgba(139,233,253,0.08);
		border: 1px solid rgba(139,233,253,0.22);
	}
	.v3-msg[data-role="agent"] .v3-msg__bubble {
		background: transparent;
		border: none; padding: 0 4px;
	}
	.v3-msg[data-role="thought"] .v3-msg__bubble {
		background: transparent;
		border: 1px dashed rgba(98,114,164,0.36);
		border-radius: 6px;
		color: #6272a4; font-style: italic;
		font-size: 12px;
	}
	.v3-tool-inline {
		display: flex; align-items: center; gap: 8px;
		padding: 5px 10px;
		margin: 2px 0;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(98,114,164,0.18);
		border-radius: 4px;
		font-size: 11.5px; cursor: pointer;
		color: #d0d3e0;
		max-width: 82%;
	}
	.v3-tool-inline:hover { border-color: rgba(98,114,164,0.36); }
	.v3-tool-inline__kind[data-k="search"] { color: #bd93f9; }
	.v3-tool-inline__kind[data-k="read"] { color: #8be9fd; }
	.v3-tool-inline__kind[data-k="edit"] { color: #ffb86c; }
	.v3-tool-inline__title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.v3-tool-inline__meta { color: #6272a4; font-size: 10.5px; }
	.v3-tool-inline__meta[data-warn="true"] { color: #ffb86c; }
	.v3-tool-body-wrap { margin: 4px 0 8px; max-width: 82%; }
	.v3-tool-body {
		background: rgba(0,0,0,0.25);
		border: 1px solid rgba(98,114,164,0.18);
		border-radius: 4px;
		padding: 8px 10px;
		font-size: 11.5px; color: #d0d3e0;
		white-space: pre-wrap;
	}
	.v3-plan-card {
		max-width: 82%;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(98,114,164,0.2);
		border-radius: 6px; padding: 10px 12px;
	}
	.v3-plan-card__head {
		font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
		color: #ff79c6; margin-bottom: 6px;
	}

	/* ==========================================================
	   VARIANT 4 — Dense CLI
	   ========================================================== */
	.v4 {
		display: flex; flex-direction: column;
		gap: 4px;
		font-size: 12.5px;
	}
	.v4-row {
		display: grid; grid-template-columns: 16px 1fr;
		gap: 8px; align-items: baseline;
		padding: 2px 0;
	}
	.v4-row__glyph {
		text-align: center; font-weight: 600;
	}
	.v4-row[data-role="user"] .v4-row__glyph { color: #8be9fd; }
	.v4-row[data-role="agent"] .v4-row__glyph { color: #ff79c6; }
	.v4-row[data-role="thought"] .v4-row__glyph { color: #6272a4; }
	.v4-row__text {
		color: #f8f8f2; white-space: pre-wrap; line-height: 1.55;
	}
	.v4-row[data-role="thought"] .v4-row__text {
		color: #6272a4; font-style: italic;
	}
	.v4-tool {
		grid-column: 1 / -1;
		display: flex; align-items: baseline; gap: 6px;
		font-size: 12px;
		padding: 1px 0;
	}
	.v4-tool__glyph { color: #6272a4; width: 16px; text-align: center; flex-shrink: 0; }
	.v4-tool__kind {
		text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.08em;
		padding: 0 4px; border-radius: 2px;
		border: 1px solid;
	}
	.v4-tool__kind[data-k="search"] { color: #bd93f9; border-color: rgba(189,147,249,0.4); }
	.v4-tool__kind[data-k="read"] { color: #8be9fd; border-color: rgba(139,233,253,0.4); }
	.v4-tool__kind[data-k="edit"] { color: #ffb86c; border-color: rgba(255,184,108,0.4); }
	.v4-tool__title { color: #f8f8f2; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.v4-tool__title code { color: #ffb86c; }
	.v4-tool__meta { color: #6272a4; font-size: 10.5px; flex-shrink: 0; }
	.v4-tool__meta[data-warn="true"] { color: #ffb86c; }
	.v4-plan {
		grid-column: 1 / -1;
		border-left: 2px solid #ff79c6;
		background: rgba(255,121,198,0.03);
		padding: 6px 12px;
		margin: 4px 0;
	}
	.v4-plan__head { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #ff79c6; margin-bottom: 4px; }
	.v4-plan__item { display: flex; gap: 6px; font-size: 12px; align-items: baseline; }
	.v4-plan__item[data-s="completed"] { color: #6272a4; text-decoration: line-through; }
	.v4-plan__item[data-s="in_progress"] { color: #ffb86c; }
	.v4-plan__mark { width: 12px; text-align: center; }

	/* ==========================================================
	   Shared: diff, permission (used across variants)
	   ========================================================== */
	.tv-diff {
		border: 1px solid rgba(98,114,164,0.22);
		border-radius: 4px; overflow: hidden;
		background: rgba(0,0,0,0.28);
		font-size: 11.5px;
		margin-top: 6px;
	}
	.tv-diff__head { padding: 4px 10px; border-bottom: 1px solid rgba(98,114,164,0.18); display: flex; align-items: center; gap: 10px; color: #6272a4; font-size: 10.5px; }
	.tv-diff__head-p { color: #f8f8f2; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tv-diff__head-stat .plus { color: #50fa7b; }
	.tv-diff__head-stat .minus { color: #ff5555; }
	.tv-diff__body { padding: 3px 0; }
	.tv-diff__line { display: grid; grid-template-columns: 28px 12px 1fr; gap: 4px; padding: 0 10px; white-space: pre; line-height: 1.55; font-size: 11px; }
	.tv-diff__line-num { color: rgba(255,255,255,0.24); text-align: right; }
	.tv-diff__line[data-k="add"] { background: rgba(80,250,123,0.1); }
	.tv-diff__line[data-k="add"] .tv-diff__line-mark, .tv-diff__line[data-k="add"] .tv-diff__line-txt { color: #50fa7b; }
	.tv-diff__line[data-k="del"] { background: rgba(255,85,85,0.1); }
	.tv-diff__line[data-k="del"] .tv-diff__line-mark, .tv-diff__line[data-k="del"] .tv-diff__line-txt { color: #ff5555; }
	.tv-diff__line[data-k="ctx"] .tv-diff__line-txt { color: rgba(248,248,242,0.55); }

	@keyframes acp-pulse-pink {
		0% { box-shadow: 0 0 0 0 rgba(255,121,198,0.6); }
		70% { box-shadow: 0 0 0 8px rgba(255,121,198,0); }
		100% { box-shadow: 0 0 0 0 rgba(255,121,198,0); }
	}
	`;
	document.head.appendChild(s);
}

// ============================================================
// Variant renderers
// ============================================================
function V1Current() {
	return (
		<div className="acp-pane" style={{ background: "transparent", padding: 0 }}>
			<div className="acp-pane__body">
				<div className="acp-pane__body-inner">
					{TURN.map((item, i) => {
						if (item.kind === "message")
							return (
								<div key={i} className="acp-msg" data-role={item.role}>
									<span className="acp-msg__avatar">
										{item.role === "user"
											? "Y"
											: item.role === "thought"
												? "✻"
												: "C"}
									</span>
									<div className="acp-msg__body">
										<div className="acp-msg__author">
											<span className="acp-msg__author-name">
												{item.role === "user"
													? "You"
													: item.role === "thought"
														? "Thinking"
														: "Claude"}
											</span>
										</div>
										<div className="acp-msg__content">{item.text}</div>
									</div>
								</div>
							);
						if (item.kind === "tool")
							return (
								<div key={i} className="acp-tool" data-kind={item.toolKind}>
									<div
										className="acp-tool__head"
										data-expanded={item.diff ? "true" : undefined}
									>
										<span className="acp-tool__caret">
											{item.diff ? "▾" : "›"}
										</span>
										<span className="acp-tool__kind">{item.toolKind}</span>
										<span className="acp-tool__title">
											<code>{item.title}</code> {item.arg}
										</span>
										<span
											className="acp-tool__meta"
											data-status={
												item.status === "pending_permission"
													? "failed"
													: "completed"
											}
										>
											<span>{item.meta}</span>
										</span>
									</div>
									{item.body && (
										<div className="acp-tool__body">
											<pre>{item.body}</pre>
										</div>
									)}
									{item.diff && <TvDiff diff={item.diff} />}
								</div>
							);
						if (item.kind === "plan")
							return (
								<div key={i} className="acp-plan">
									<div className="acp-plan__head">
										<span>Plan</span>
										<span className="acp-plan__head-progress">
											2 / 4 in progress
										</span>
									</div>
									<ol className="acp-plan__items">
										{item.entries.map((e, j) => (
											<li
												key={j}
												className="acp-plan__item"
												data-status={e.status}
											>
												<span className="acp-plan__box">
													{e.status === "completed"
														? "✓"
														: e.status === "in_progress"
															? "▸"
															: ""}
												</span>
												<span className="acp-plan__text">{e.content}</span>
												<span
													className="acp-plan__priority"
													data-level={e.priority}
												>
													{e.priority}
												</span>
											</li>
										))}
									</ol>
								</div>
							);
						if (item.kind === "permission")
							return (
								<div key={i} className="acp-perm">
									<div className="acp-perm__head">
										<span className="acp-perm__pulse" />
										<span>Permission required · Edit</span>
									</div>
									<div className="acp-perm__q">{item.question}</div>
									<div className="acp-perm__options">
										{item.options.map((o) => (
											<button key={o.id} className="acp-perm__option">
												<span className="acp-perm__option-key">{o.key}</span>
												<span>{o.name}</span>
												<span className="acp-perm__option-hint">{o.hint}</span>
											</button>
										))}
									</div>
								</div>
							);
						return null;
					})}
				</div>
			</div>
		</div>
	);
}

function V2Linear() {
	const [expanded, setExpanded] = useState({});
	return (
		<div className="v2">
			{TURN.map((item, i) => {
				if (item.kind === "message")
					return (
						<div key={i} className="v2-turn" data-role={item.role}>
							<div className="v2-turn__role">
								{item.role === "user"
									? "You"
									: item.role === "thought"
										? "Thinking"
										: "Claude"}
							</div>
							<div className="v2-turn__text">{item.text}</div>
						</div>
					);
				if (item.kind === "tool") {
					const open = expanded[i] ?? !!item.diff;
					return (
						<React.Fragment key={i}>
							<div
								className="v2-tool"
								onClick={() => setExpanded((e) => ({ ...e, [i]: !open }))}
								style={{ cursor: "pointer" }}
							>
								<span
									style={{ color: "#6272a4", width: 10, textAlign: "center" }}
								>
									{open ? "▾" : "›"}
								</span>
								<span className="v2-tool__kind" data-k={item.toolKind}>
									{item.toolKind}
								</span>
								<span className="v2-tool__title">
									<code>{item.title}</code> {item.arg}
								</span>
								<span
									className="v2-tool__meta"
									data-warn={item.status === "pending_permission"}
								>
									{item.meta}
								</span>
							</div>
							{open && item.body && (
								<div className="v2-tool__body">{item.body}</div>
							)}
							{open && item.diff && (
								<div className="v2-tool__body" style={{ padding: 0 }}>
									<TvDiff diff={item.diff} />
								</div>
							)}
						</React.Fragment>
					);
				}
				if (item.kind === "plan")
					return (
						<div key={i} className="v2-plan">
							<div className="v2-plan__head">◫ Plan · 2 / 4 in progress</div>
							{item.entries.map((e, j) => (
								<div key={j} className="v2-plan__item" data-s={e.status}>
									<span className="v2-plan__box">
										{e.status === "completed"
											? "✓"
											: e.status === "in_progress"
												? "▸"
												: ""}
									</span>
									<span className="v2-plan__txt">{e.content}</span>
									<span className="v2-plan__pri" data-p={e.priority}>
										{e.priority}
									</span>
								</div>
							))}
						</div>
					);
				if (item.kind === "permission")
					return (
						<div key={i} className="v2-perm">
							<div className="v2-perm__head">
								<span className="v2-perm__pulse" />
								<span>Permission required · Edit</span>
							</div>
							<div className="v2-perm__q">{item.question}</div>
							<div className="v2-perm__opts">
								{item.options.map((o) => (
									<button key={o.id} className="v2-perm__opt">
										<span className="v2-perm__key">{o.key}</span>
										<span>{o.name}</span>
										<span className="v2-perm__hint">{o.hint}</span>
									</button>
								))}
							</div>
						</div>
					);
				return null;
			})}
		</div>
	);
}

function V3Chat() {
	const [expanded, setExpanded] = useState({});
	return (
		<div className="v3">
			{TURN.map((item, i) => {
				if (item.kind === "message")
					return (
						<div key={i} className="v3-msg" data-role={item.role}>
							<div className="v3-msg__author">
								{item.role === "user"
									? "You"
									: item.role === "thought"
										? "Thinking"
										: "Claude"}
							</div>
							<div className="v3-msg__bubble">{item.text}</div>
						</div>
					);
				if (item.kind === "tool") {
					const open = expanded[i] ?? !!item.diff;
					return (
						<React.Fragment key={i}>
							<div
								className="v3-tool-inline"
								onClick={() => setExpanded((e) => ({ ...e, [i]: !open }))}
							>
								<span style={{ color: "#6272a4" }}>{open ? "▾" : "›"}</span>
								<span className="v3-tool-inline__kind" data-k={item.toolKind}>
									{item.toolKind}
								</span>
								<span className="v3-tool-inline__title">
									<code
										style={{
											background: "rgba(255,255,255,0.05)",
											padding: "1px 4px",
											borderRadius: 2,
											fontSize: 10.5,
										}}
									>
										{item.title}
									</code>{" "}
									{item.arg}
								</span>
								<span
									className="v3-tool-inline__meta"
									data-warn={item.status === "pending_permission"}
								>
									{item.meta}
								</span>
							</div>
							{open && item.body && (
								<div className="v3-tool-body-wrap">
									<div className="v3-tool-body">{item.body}</div>
								</div>
							)}
							{open && item.diff && (
								<div className="v3-tool-body-wrap">
									<TvDiff diff={item.diff} />
								</div>
							)}
						</React.Fragment>
					);
				}
				if (item.kind === "plan")
					return (
						<div key={i} className="v3-plan-card">
							<div className="v3-plan-card__head">
								◫ Plan · 2 / 4 in progress
							</div>
							{item.entries.map((e, j) => (
								<div key={j} className="v2-plan__item" data-s={e.status}>
									<span className="v2-plan__box">
										{e.status === "completed"
											? "✓"
											: e.status === "in_progress"
												? "▸"
												: ""}
									</span>
									<span className="v2-plan__txt">{e.content}</span>
									<span className="v2-plan__pri" data-p={e.priority}>
										{e.priority}
									</span>
								</div>
							))}
						</div>
					);
				if (item.kind === "permission")
					return (
						<div key={i} className="v2-perm" style={{ maxWidth: "82%" }}>
							<div className="v2-perm__head">
								<span className="v2-perm__pulse" />
								<span>Permission required · Edit</span>
							</div>
							<div className="v2-perm__q">{item.question}</div>
							<div className="v2-perm__opts">
								{item.options.map((o) => (
									<button key={o.id} className="v2-perm__opt">
										<span className="v2-perm__key">{o.key}</span>
										<span>{o.name}</span>
										<span className="v2-perm__hint">{o.hint}</span>
									</button>
								))}
							</div>
						</div>
					);
				return null;
			})}
		</div>
	);
}

function V4Dense() {
	const [expanded, setExpanded] = useState({});
	return (
		<div className="v4">
			{TURN.map((item, i) => {
				if (item.kind === "message")
					return (
						<div key={i} className="v4-row" data-role={item.role}>
							<span className="v4-row__glyph">
								{item.role === "user"
									? "❯"
									: item.role === "thought"
										? "✻"
										: "⏺"}
							</span>
							<span className="v4-row__text">{item.text}</span>
						</div>
					);
				if (item.kind === "tool") {
					const open = expanded[i] ?? !!item.diff;
					return (
						<React.Fragment key={i}>
							<div
								className="v4-tool"
								onClick={() => setExpanded((e) => ({ ...e, [i]: !open }))}
								style={{ cursor: "pointer" }}
							>
								<span className="v4-tool__glyph">{open ? "▾" : "›"}</span>
								<span className="v4-tool__kind" data-k={item.toolKind}>
									{item.toolKind}
								</span>
								<span className="v4-tool__title">
									<code>{item.title}</code> {item.arg}
								</span>
								<span
									className="v4-tool__meta"
									data-warn={item.status === "pending_permission"}
								>
									{item.meta}
								</span>
							</div>
							{open && item.body && (
								<div
									className="v4-row"
									style={{ gridTemplateColumns: "24px 1fr" }}
								>
									<span></span>
									<pre
										style={{
											margin: 0,
											color: "#d0d3e0",
											fontSize: 11,
											background: "rgba(0,0,0,0.25)",
											padding: "6px 8px",
											borderRadius: 3,
											whiteSpace: "pre-wrap",
										}}
									>
										{item.body}
									</pre>
								</div>
							)}
							{open && item.diff && (
								<div
									className="v4-row"
									style={{ gridTemplateColumns: "24px 1fr" }}
								>
									<span></span>
									<TvDiff diff={item.diff} />
								</div>
							)}
						</React.Fragment>
					);
				}
				if (item.kind === "plan")
					return (
						<div key={i} className="v4-plan">
							<div className="v4-plan__head">◫ Plan · 2/4 in progress</div>
							{item.entries.map((e, j) => (
								<div key={j} className="v4-plan__item" data-s={e.status}>
									<span className="v4-plan__mark">
										{e.status === "completed"
											? "✓"
											: e.status === "in_progress"
												? "▸"
												: "·"}
									</span>
									<span>{e.content}</span>
								</div>
							))}
						</div>
					);
				if (item.kind === "permission")
					return (
						<div
							key={i}
							className="v4-row"
							style={{ gridTemplateColumns: "24px 1fr" }}
						>
							<span></span>
							<div className="v2-perm">
								<div className="v2-perm__head">
									<span className="v2-perm__pulse" />
									<span>Permission required · Edit</span>
								</div>
								<div className="v2-perm__q">{item.question}</div>
								<div className="v2-perm__opts">
									{item.options.map((o) => (
										<button key={o.id} className="v2-perm__opt">
											<span className="v2-perm__key">{o.key}</span>
											<span>{o.name}</span>
											<span className="v2-perm__hint">{o.hint}</span>
										</button>
									))}
								</div>
							</div>
						</div>
					);
				return null;
			})}
		</div>
	);
}

function TvDiff({ diff }) {
	return (
		<div className="tv-diff">
			<div className="tv-diff__head">
				<span>diff</span>
				<span className="tv-diff__head-p">{diff.path}</span>
				<span className="tv-diff__head-stat">
					<span className="plus">+{diff.stats.plus}</span>{" "}
					<span className="minus">−{diff.stats.minus}</span>
				</span>
			</div>
			<div className="tv-diff__body">
				{diff.hunk.map((h, i) => (
					<div key={i} className="tv-diff__line" data-k={h.type}>
						<span className="tv-diff__line-num">{h.ln}</span>
						<span className="tv-diff__line-mark">
							{h.type === "add" ? "+" : h.type === "del" ? "−" : " "}
						</span>
						<span className="tv-diff__line-txt">{h.txt}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ============================================================
// App
// ============================================================
const VARIANTS = [
	{
		id: 1,
		name: "Current",
		desc: "现有版本 · avatar 方块 + 卡片式 tool call",
		render: () => <V1Current />,
	},
	{
		id: 2,
		name: "Linear",
		desc: "左边线 gutter · role 标签 · tool 压缩为单行卡",
		render: () => <V2Linear />,
	},
	{
		id: 3,
		name: "Chat Bubble",
		desc: "user 右侧气泡 · agent 无背景直排 · thought 虚线框",
		render: () => <V3Chat />,
	},
	{
		id: 4,
		name: "Dense CLI",
		desc: "极简 · 单字符 glyph · 无 avatar · 类似真终端输出",
		render: () => <V4Dense />,
	},
];

function App() {
	const [focused, setFocused] = useState(null);
	React.useEffect(() => {
		const h = (e) => {
			if (e.key === "Escape") setFocused(null);
		};
		window.addEventListener("keydown", h);
		return () => window.removeEventListener("keydown", h);
	}, []);
	const focusedV = focused ? VARIANTS.find((v) => v.id === focused) : null;
	return (
		<div className="tv-page">
			<div className="tv-topbar">
				<span style={{ color: "#ff79c6", fontSize: 16 }}>◆</span>
				<span>
					Superset · ACP Timeline · <b>Rendering Variants</b>
				</span>
				<span className="dim">同一份对话数据 · 4 种视觉方向</span>
			</div>
			<div className="tv-grid">
				{VARIANTS.map((v) => (
					<div key={v.id} className="tv-frame">
						<div className="tv-frame__head">
							<span className="tv-frame__num">
								V{String(v.id).padStart(2, "0")}
							</span>
							<span className="tv-frame__name">{v.name}</span>
							<span className="tv-frame__desc">{v.desc}</span>
							<button
								className="tv-frame__focus"
								onClick={() => setFocused(v.id)}
							>
								Focus ⤢
							</button>
						</div>
						<div className="tv-frame__box">
							<div className="tv-frame__body">{v.render()}</div>
						</div>
					</div>
				))}
			</div>
			{focusedV && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 100,
						background: "rgba(10,10,12,0.94)",
						backdropFilter: "blur(12px)",
						display: "flex",
						flexDirection: "column",
						padding: 24,
						gap: 16,
					}}
					onClick={(e) => {
						if (e.currentTarget === e.target) setFocused(null);
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 16,
							color: "#6272a4",
							fontSize: 12,
						}}
					>
						<span className="tv-frame__num">
							V{String(focusedV.id).padStart(2, "0")}
						</span>
						<span style={{ color: "#f8f8f2", fontSize: 14, fontWeight: 500 }}>
							{focusedV.name}
						</span>
						<span>{focusedV.desc}</span>
						<button
							style={{
								marginLeft: "auto",
								background: "rgba(255,255,255,0.06)",
								border: "1px solid rgba(255,255,255,0.1)",
								color: "#f8f8f2",
								padding: "6px 14px",
								borderRadius: 4,
								cursor: "pointer",
								font: "inherit",
								fontSize: 12,
							}}
							onClick={() => setFocused(null)}
						>
							Esc · close
						</button>
					</div>
					<div
						style={{
							flex: 1,
							minHeight: 0,
							borderRadius: 10,
							overflow: "hidden",
							background: "#282a36",
							boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
						}}
					>
						<div style={{ height: "100%", overflow: "auto", padding: 24 }}>
							{focusedV.render()}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
