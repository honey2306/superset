// v03-plan-variants.jsx — V03 Chat Bubble timeline + 3 plan variants
const { useState } = React;

// Shared mock: full turn with plan positioned in the middle
const TURN_BASE = [
	{
		kind: "message",
		role: "user",
		text: "把 ACP session pane 关闭时的确认提示改成中文,并且区分 running 和 awaiting_permission 两种状态的措辞。",
	},
	{
		kind: "message",
		role: "thought",
		text: "先找一下关闭 pane 的入口逻辑,看看当前是怎么区分 idle / running 的。",
	},
	{
		kind: "tool",
		toolKind: "search",
		title: "grep",
		arg: '"confirmCloseAcpSession"',
		status: "completed",
		meta: "3 matches · 148ms",
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
	},
	{
		kind: "message",
		role: "agent",
		text: '拿到了。我准备把两条 English 提示改成:\n- running: "Agent 正在运行,关闭会取消当前 turn。仍要关闭吗?"\n- awaiting_permission: "Agent 正在等待你的授权,关闭将拒绝本次请求。仍要关闭吗?"',
	},
	{ kind: "plan-slot" }, // placeholder — swapped per variant
	{
		kind: "tool",
		toolKind: "edit",
		title: "Edit",
		arg: "confirmCloseAcpSession.ts · L17-L20",
		status: "pending_permission",
		meta: "blocked on permission",
	},
];

const PLAN_ENTRIES = [
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
	{ content: "更新对应 pane 测试用例", status: "pending", priority: "medium" },
	{ content: "跑 typecheck + lint", status: "pending", priority: "low" },
];

// ============================================================
// Shared page styles
// ============================================================
if (!document.getElementById("pv-shell")) {
	const s = document.createElement("style");
	s.id = "pv-shell";
	s.textContent = `
	*, *::before, *::after { box-sizing: border-box; }
	body {
		margin: 0; background: #191a21;
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}
	.pv-page { min-height: 100vh; display: flex; flex-direction: column; }
	.pv-topbar {
		padding: 12px 32px;
		border-bottom: 1px solid rgba(98,114,164,0.18);
		background: #21222c;
		display: flex; align-items: center; gap: 12px;
		font-size: 13px; color: #d0d3e0;
	}
	.pv-topbar b { color: #ff79c6; font-weight: 500; }
	.pv-topbar .dim { color: #6272a4; font-size: 11.5px; }

	.pv-grid {
		flex: 1; display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 28px; padding: 28px;
	}
	.pv-frame { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
	.pv-frame__head { display: flex; align-items: baseline; gap: 10px; }
	.pv-frame__num { font-size: 10.5px; letter-spacing: 0.14em; color: #6272a4; }
	.pv-frame__name { color: #f8f8f2; font-size: 15px; font-weight: 500; }
	.pv-frame__desc { color: #6272a4; font-size: 11.5px; }
	.pv-frame__focus {
		margin-left: auto;
		background: transparent; border: 1px solid rgba(255,255,255,0.08);
		color: #6272a4; padding: 3px 10px; border-radius: 3px;
		cursor: pointer; font-size: 11px; font: inherit;
	}
	.pv-frame__focus:hover { color: #f8f8f2; border-color: rgba(255,255,255,0.24); }
	.pv-frame__box {
		background: #282a36; border-radius: 8px; overflow: hidden;
		box-shadow: 0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,121,198,0.06);
		height: 680px; display: flex; flex-direction: column;
	}
	.pv-frame__body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; scrollbar-width: thin; }
	.pv-frame__body::-webkit-scrollbar { width: 6px; }
	.pv-frame__body::-webkit-scrollbar-thumb { background: rgba(98,114,164,0.3); border-radius: 3px; }

	/* ==========================================================
	   V03 Chat Bubble base (polished)
	   ========================================================== */
	.v3 { display: flex; flex-direction: column; gap: 12px; }
	.v3-msg { display: flex; flex-direction: column; }
	.v3-msg[data-role="user"] { align-items: flex-end; }
	.v3-msg__author {
		font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
		color: #6272a4; margin-bottom: 4px; padding: 0 4px;
	}
	.v3-msg[data-role="user"] .v3-msg__author { color: #8be9fd; }
	.v3-msg[data-role="agent"] .v3-msg__author { color: #ff79c6; }
	.v3-msg__bubble {
		max-width: 82%;
		font-size: 13px; line-height: 1.65; color: #f8f8f2;
		white-space: pre-wrap;
	}
	.v3-msg[data-role="user"] .v3-msg__bubble {
		padding: 9px 13px;
		background: rgba(139,233,253,0.08);
		border: 1px solid rgba(139,233,253,0.22);
		border-radius: 12px 12px 4px 12px;
	}
	.v3-msg[data-role="agent"] .v3-msg__bubble { padding: 0 4px; }
	.v3-msg[data-role="thought"] .v3-msg__bubble {
		padding: 8px 12px;
		border: 1px dashed rgba(98,114,164,0.36);
		border-radius: 8px;
		color: #6272a4; font-style: italic; font-size: 12px;
	}

	.v3-tool {
		display: flex; align-items: center; gap: 8px;
		padding: 6px 10px;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(98,114,164,0.22);
		border-radius: 5px;
		font-size: 11.5px; cursor: pointer;
		color: #d0d3e0;
		max-width: 82%;
	}
	.v3-tool:hover { border-color: rgba(98,114,164,0.4); }
	.v3-tool__caret { color: #6272a4; }
	.v3-tool__kind {
		text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.1em;
		padding: 1px 6px; border-radius: 2px; font-weight: 500;
		border: 1px solid;
	}
	.v3-tool__kind[data-k="search"] { color: #bd93f9; border-color: rgba(189,147,249,0.4); }
	.v3-tool__kind[data-k="read"] { color: #8be9fd; border-color: rgba(139,233,253,0.4); }
	.v3-tool__kind[data-k="edit"] { color: #ffb86c; border-color: rgba(255,184,108,0.4); }
	.v3-tool__title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.v3-tool__title code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 2px; font-size: 11px; color: #f8f8f2; }
	.v3-tool__meta { color: #6272a4; font-size: 10.5px; flex-shrink: 0; }
	.v3-tool__meta[data-warn="true"] { color: #ffb86c; }
	.v3-tool-body {
		max-width: 82%;
		background: rgba(0,0,0,0.28);
		border: 1px solid rgba(98,114,164,0.18);
		border-radius: 5px;
		padding: 8px 10px;
		font-size: 11.5px; color: #d0d3e0;
		white-space: pre-wrap;
		margin-top: 4px;
	}

	/* ==========================================================
	   PLAN A · Progress bar oriented
	   ========================================================== */
	.plan-a {
		max-width: 82%;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(255,121,198,0.2);
		border-radius: 8px;
		padding: 12px 14px;
	}
	.plan-a__head {
		display: flex; align-items: baseline; gap: 8px;
		margin-bottom: 10px;
	}
	.plan-a__title {
		color: #ff79c6; font-size: 11px; letter-spacing: 0.12em;
		text-transform: uppercase; font-weight: 600;
	}
	.plan-a__count { color: #6272a4; font-size: 11px; }
	.plan-a__count b { color: #ff79c6; font-weight: 500; }
	.plan-a__progress {
		flex: 1; height: 3px;
		background: rgba(98,114,164,0.2);
		border-radius: 2px; overflow: hidden;
		align-self: center; margin-left: 4px;
	}
	.plan-a__progress-fill {
		height: 100%;
		background: linear-gradient(to right, #50fa7b 0%, #50fa7b 62%, #ffb86c 62%, #ffb86c 88%, transparent 88%);
		border-radius: 2px;
	}
	.plan-a__items { display: flex; flex-direction: column; gap: 3px; }
	.plan-a__item {
		display: flex; align-items: center; gap: 10px;
		font-size: 12.5px;
		padding: 4px 0;
	}
	.plan-a__dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
	.plan-a__item[data-s="completed"] .plan-a__dot { background: #50fa7b; }
	.plan-a__item[data-s="in_progress"] .plan-a__dot {
		background: #ffb86c;
		box-shadow: 0 0 0 3px rgba(255,184,108,0.15);
		animation: plan-pulse 1.8s ease-in-out infinite;
	}
	.plan-a__item[data-s="pending"] .plan-a__dot { background: transparent; border: 1.5px solid #44475a; }
	.plan-a__item[data-s="completed"] .plan-a__txt { color: #6272a4; text-decoration: line-through; text-decoration-color: rgba(98,114,164,0.5); }
	.plan-a__item[data-s="in_progress"] .plan-a__txt { color: #f8f8f2; font-weight: 500; }
	.plan-a__item[data-s="pending"] .plan-a__txt { color: #d0d3e0; }
	.plan-a__txt { flex: 1; }

	@keyframes plan-pulse {
		0%, 100% { box-shadow: 0 0 0 3px rgba(255,184,108,0.15); }
		50% { box-shadow: 0 0 0 6px rgba(255,184,108,0.05); }
	}

	/* ==========================================================
	   PLAN B · Linear task tracker
	   ========================================================== */
	.plan-b {
		max-width: 82%;
		background: rgba(255,255,255,0.015);
		border-radius: 8px;
		overflow: hidden;
	}
	.plan-b__head {
		padding: 8px 14px 6px;
		display: flex; align-items: center; gap: 8px;
		border-bottom: 1px solid rgba(98,114,164,0.15);
		background: rgba(255,255,255,0.02);
	}
	.plan-b__title {
		color: #ff79c6; font-size: 10.5px; letter-spacing: 0.14em;
		text-transform: uppercase; font-weight: 600;
	}
	.plan-b__meta { margin-left: auto; color: #6272a4; font-size: 10.5px; }
	.plan-b__meta b { color: #f8f8f2; font-weight: 500; }
	.plan-b__items { display: flex; flex-direction: column; }
	.plan-b__item {
		display: grid;
		grid-template-columns: 3px 20px 1fr auto;
		align-items: center; gap: 10px;
		padding: 7px 14px;
		border-top: 1px solid rgba(98,114,164,0.08);
	}
	.plan-b__item:first-of-type { border-top: none; }
	.plan-b__bar { align-self: stretch; border-radius: 2px; }
	.plan-b__item[data-s="completed"] .plan-b__bar { background: rgba(80,250,123,0.55); }
	.plan-b__item[data-s="in_progress"] .plan-b__bar {
		background: linear-gradient(180deg, #ffb86c 0%, rgba(255,184,108,0.4) 100%);
	}
	.plan-b__item[data-s="pending"] .plan-b__bar { background: rgba(98,114,164,0.28); }
	.plan-b__icon {
		width: 16px; height: 16px; border-radius: 4px;
		display: flex; align-items: center; justify-content: center;
		font-size: 10px; font-weight: 600;
	}
	.plan-b__item[data-s="completed"] .plan-b__icon {
		background: rgba(80,250,123,0.16); color: #50fa7b;
	}
	.plan-b__item[data-s="in_progress"] .plan-b__icon {
		background: rgba(255,184,108,0.16); color: #ffb86c;
	}
	.plan-b__item[data-s="pending"] .plan-b__icon {
		background: transparent; color: #6272a4;
		border: 1px solid rgba(98,114,164,0.36);
	}
	.plan-b__txt { font-size: 12.5px; }
	.plan-b__item[data-s="completed"] .plan-b__txt {
		color: #6272a4; text-decoration: line-through;
		text-decoration-color: rgba(98,114,164,0.5);
	}
	.plan-b__item[data-s="in_progress"] .plan-b__txt { color: #f8f8f2; font-weight: 500; }
	.plan-b__item[data-s="pending"] .plan-b__txt { color: #d0d3e0; }
	.plan-b__pri {
		font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;
		color: #6272a4;
	}
	.plan-b__pri[data-p="high"] { color: #ff5555; }
	.plan-b__pri[data-p="medium"] { color: #ffb86c; }
	.plan-b__pri[data-p="low"] { color: #6272a4; }

	/* ==========================================================
	   PLAN C · Vertical timeline
	   ========================================================== */
	.plan-c {
		max-width: 82%;
		padding: 4px 0;
	}
	.plan-c__head {
		display: flex; align-items: center; gap: 8px;
		padding: 4px 0 12px;
		margin-left: 22px;
	}
	.plan-c__title {
		color: #ff79c6; font-size: 10.5px; letter-spacing: 0.14em;
		text-transform: uppercase; font-weight: 600;
	}
	.plan-c__count { color: #6272a4; font-size: 10.5px; }
	.plan-c__count b { color: #ff79c6; font-weight: 500; }
	.plan-c__items { position: relative; }
	.plan-c__line {
		position: absolute; left: 10px; top: 8px; bottom: 12px;
		width: 2px; background: rgba(98,114,164,0.2);
		border-radius: 2px;
	}
	.plan-c__item {
		display: grid;
		grid-template-columns: 22px 1fr;
		gap: 12px; align-items: center;
		padding: 5px 0;
		position: relative;
	}
	.plan-c__node {
		width: 22px; height: 22px;
		border-radius: 50%;
		background: #282a36;
		display: flex; align-items: center; justify-content: center;
		position: relative; z-index: 1;
		font-size: 10px; font-weight: 700;
	}
	.plan-c__item[data-s="completed"] .plan-c__node {
		background: #50fa7b; color: #282a36;
		box-shadow: 0 0 0 3px rgba(80,250,123,0.15);
	}
	.plan-c__item[data-s="in_progress"] .plan-c__node {
		background: rgba(255,184,108,0.15); color: #ffb86c;
		border: 2px solid #ffb86c;
		animation: plan-c-pulse 1.6s ease-in-out infinite;
	}
	.plan-c__item[data-s="pending"] .plan-c__node {
		background: #282a36; color: #6272a4;
		border: 1.5px solid rgba(98,114,164,0.36);
	}
	@keyframes plan-c-pulse {
		0%, 100% { box-shadow: 0 0 0 0 rgba(255,184,108,0.4); }
		50% { box-shadow: 0 0 0 6px rgba(255,184,108,0); }
	}
	.plan-c__txt { font-size: 12.5px; padding: 4px 0; }
	.plan-c__item[data-s="completed"] .plan-c__txt {
		color: #6272a4; text-decoration: line-through;
		text-decoration-color: rgba(98,114,164,0.5);
	}
	.plan-c__item[data-s="in_progress"] .plan-c__txt { color: #f8f8f2; font-weight: 500; }
	.plan-c__item[data-s="pending"] .plan-c__txt { color: #d0d3e0; }
	`;
	document.head.appendChild(s);
}

// ============================================================
// V03 Timeline Renderer (accepts plan renderer as prop)
// ============================================================
function V03Timeline({ renderPlan }) {
	const [expanded, setExpanded] = useState({});
	return (
		<div className="v3">
			{TURN_BASE.map((item, i) => {
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
					const open = expanded[i] ?? false;
					return (
						<React.Fragment key={i}>
							<div
								className="v3-tool"
								onClick={() => setExpanded((e) => ({ ...e, [i]: !open }))}
							>
								<span className="v3-tool__caret">{open ? "▾" : "›"}</span>
								<span className="v3-tool__kind" data-k={item.toolKind}>
									{item.toolKind}
								</span>
								<span className="v3-tool__title">
									<code>{item.title}</code> {item.arg}
								</span>
								<span
									className="v3-tool__meta"
									data-warn={item.status === "pending_permission"}
								>
									{item.meta}
								</span>
							</div>
							{open && item.body && (
								<div className="v3-tool-body">{item.body}</div>
							)}
						</React.Fragment>
					);
				}
				if (item.kind === "plan-slot") {
					return <React.Fragment key={i}>{renderPlan()}</React.Fragment>;
				}
				return null;
			})}
		</div>
	);
}

// ============================================================
// Plan variants
// ============================================================
function PlanA() {
	const done = PLAN_ENTRIES.filter((e) => e.status === "completed").length;
	const inProg = PLAN_ENTRIES.filter((e) => e.status === "in_progress").length;
	const pct = ((done / PLAN_ENTRIES.length) * 100).toFixed(0);
	return (
		<div className="plan-a">
			<div className="plan-a__head">
				<span className="plan-a__title">◫ Plan</span>
				<span className="plan-a__count">
					<b>{done}</b> of {PLAN_ENTRIES.length} done · <b>{inProg}</b> in
					progress
				</span>
				<span className="plan-a__progress">
					<span
						className="plan-a__progress-fill"
						style={{ width: `${pct + (inProg / PLAN_ENTRIES.length) * 100}%` }}
					/>
				</span>
			</div>
			<div className="plan-a__items">
				{PLAN_ENTRIES.map((e, i) => (
					<div key={i} className="plan-a__item" data-s={e.status}>
						<span className="plan-a__dot" />
						<span className="plan-a__txt">{e.content}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function PlanB() {
	const done = PLAN_ENTRIES.filter((e) => e.status === "completed").length;
	const inProg = PLAN_ENTRIES.filter((e) => e.status === "in_progress").length;
	return (
		<div className="plan-b">
			<div className="plan-b__head">
				<span className="plan-b__title">◫ Plan</span>
				<span className="plan-b__meta">
					<b>
						{done}/{PLAN_ENTRIES.length}
					</b>{" "}
					done · {inProg} in progress
				</span>
			</div>
			<div className="plan-b__items">
				{PLAN_ENTRIES.map((e, i) => (
					<div key={i} className="plan-b__item" data-s={e.status}>
						<span className="plan-b__bar" />
						<span className="plan-b__icon">
							{e.status === "completed"
								? "✓"
								: e.status === "in_progress"
									? "▸"
									: ""}
						</span>
						<span className="plan-b__txt">{e.content}</span>
						<span className="plan-b__pri" data-p={e.priority}>
							{e.priority}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function PlanC() {
	const done = PLAN_ENTRIES.filter((e) => e.status === "completed").length;
	return (
		<div className="plan-c">
			<div className="plan-c__head">
				<span className="plan-c__title">◫ Plan</span>
				<span className="plan-c__count">
					<b>{done}</b> of {PLAN_ENTRIES.length} steps done
				</span>
			</div>
			<div className="plan-c__items">
				<span className="plan-c__line" />
				{PLAN_ENTRIES.map((e, i) => (
					<div key={i} className="plan-c__item" data-s={e.status}>
						<span className="plan-c__node">
							{e.status === "completed"
								? "✓"
								: e.status === "in_progress"
									? "▸"
									: i + 1}
						</span>
						<span className="plan-c__txt">{e.content}</span>
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
		id: "A",
		name: "Progress Bar",
		desc: "极简小圆点 · 顶部进度条 · 无 priority · animated in-progress dot",
		render: () => <PlanA />,
	},
	{
		id: "B",
		name: "Task Tracker",
		desc: "Linear 风 · 左侧 3px 状态色条 · 图标 chip · 保留 priority 小 label",
		render: () => <PlanB />,
	},
	{
		id: "C",
		name: "Vertical Steps",
		desc: "时间线连接节点 · 编号步骤 · 完成/进行/待办清晰节点样式",
		render: () => <PlanC />,
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
		<div className="pv-page">
			<div className="pv-topbar">
				<span style={{ color: "#ff79c6", fontSize: 16 }}>◆</span>
				<span>
					Superset · V03 Chat Bubble · <b>Plan Variants</b>
				</span>
				<span className="dim">3 种 plan 视觉方向,timeline 上下文一致</span>
			</div>
			<div className="pv-grid">
				{VARIANTS.map((v) => (
					<div key={v.id} className="pv-frame">
						<div className="pv-frame__head">
							<span className="pv-frame__num">PLAN · {v.id}</span>
							<span className="pv-frame__name">{v.name}</span>
							<button
								className="pv-frame__focus"
								onClick={() => setFocused(v.id)}
							>
								Focus ⤢
							</button>
						</div>
						<div
							className="pv-frame__desc"
							style={{
								color: "#6272a4",
								fontSize: 11.5,
								padding: "0 2px 4px",
								lineHeight: 1.6,
							}}
						>
							{v.desc}
						</div>
						<div className="pv-frame__box">
							<div className="pv-frame__body">
								<V03Timeline renderPlan={v.render} />
							</div>
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
						<span className="pv-frame__num">PLAN · {focusedV.id}</span>
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
							<V03Timeline renderPlan={focusedV.render} />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
