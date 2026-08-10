// app.jsx — canvas: analysis text + 4 variant frames, focus overlay for zoom-in

const { useState, useCallback } = React;

const VARIANTS = [
	{
		id: "v1",
		num: "01",
		title: "Baseline Terminal",
		tag: "Claude Code faithful",
		desc: "最保守的一版:等宽字体、单色调、无面板、无阴影。忠实还原 CLI 的转录感,只在 Claude 标识和权限提示上用一点 Anthropic 橙。适合作为最低下限 / 与其它变体对齐的参照物。",
		render: () => <window.V1BaselineTerminal />,
	},
	{
		id: "v2",
		num: "02",
		title: "Split TUI",
		tag: "OpenCode / neovim 感",
		desc: "左侧 44px gutter 放操作类别徽章(timeline / plan / files / perm / commands),主区域时间线,底部 vim-like status line:mode · model · token 进度条 · branch · connection。信息密度高,一屏能看完整状态。",
		render: () => <window.V2SplitTUI />,
	},
	{
		id: "v3",
		num: "03",
		title: "Modern Editor Chrome",
		tag: "Zed / Warp / Ghostty",
		desc: "保留 mono 字体和终端骨架,但引入 Zed 式圆角面板、渐变 header、agent chip、面包屑 cwd/branch。Tool call 按 kind 上色(read=青,edit=琥珀,search=紫,execute=绿),更适合 UI-first 的程序员。",
		render: () => <window.V3ModernEditor />,
	},
	{
		id: "v4",
		num: "04",
		title: "Control Plane Native",
		tag: "Superset 独有 · 强推荐",
		desc: "把 acp-agent-control-plane.md 的核心哲学做成 UI:顶部 Runtime Profile 一等公民(agent × protocol × model × mode 四槽随时切换),下面 workspace 上下文条,中间时间线,底部 status bar 有 token bar + turn timer + cost。Permission 卡片是热橙色脉动 + 4 个键盘快捷键。这是 Superset 唯一做得到、别人做不出来的样子。",
		render: () => <window.V4ControlPlane />,
	},
];

function AnalysisBlock() {
	return (
		<div className="analysis">
			<div className="analysis__col">
				<h4>ACP 数据里已经有但当前 UI 没用的信息</h4>
				<ul>
					<li>
						<b>cwd / harness</b> — 每个 session 都能拿到,却没在 header 显示
					</li>
					<li>
						<b>usage · used/size/cost</b> — token
						上限、当前用量、当前费用全有,可做进度条
					</li>
					<li>
						<b>availableCommands[]</b> — Agent 自报的 slash 命令,可做 `/` 面板
					</li>
					<li>
						<b>ToolKind × 10</b> —
						read/edit/delete/move/search/execute/think/fetch/switch_mode/other,可做精细图标
					</li>
					<li>
						<b>PlanEntry.priority</b> — high/medium/low,当前 UI 全部当作平铺列表
					</li>
					<li>
						<b>ai-elements 组件库</b> —
						plan/tool-call/file-diff-tool/reasoning/bash-tool 已存在,只有
						message 被接入
					</li>
				</ul>
			</div>
			<div className="analysis__col">
				<h4>Claude Code / OpenCode / Codex / aider 的共性</h4>
				<ul>
					<li>
						都是<b>单列时间线 + 底部 composer</b>,极少多面板
					</li>
					<li>
						都用<b>等宽字体 + 极暗背景</b>,信息以线性组织为主
					</li>
					<li>
						都用<b>颜色而非图标</b>区分 user/agent/tool
					</li>
					<li>
						Tool call 都做<b>可折叠</b>(展开看 raw input/output)
					</li>
					<li>
						Permission 都靠<b>键盘数字键</b>响应,不是鼠标点击
					</li>
					<li>
						都在<b>顶部或底部有一个状态条</b>(model / mode / token / cost)
					</li>
				</ul>
			</div>
			<div className="analysis__col">
				<h4>Superset 相对它们真正独特的立点</h4>
				<ul>
					<li>
						<b>Runtime Profile 一等公民</b> — Agent + Protocol + Model + Mode
						四槽明示,别人只有 model
					</li>
					<li>
						<b>Workspace 强联动</b> — branch/cwd/dirty count
						是运行时上下文,不是设置
					</li>
					<li>
						<b>多 Agent 平权</b> — Claude/Codex/Vibe 用同一时间线渲染,未知能力有
						fallback
					</li>
					<li>
						<b>可审计</b> — 每个 tool call 显示是否自动放行、为什么、cost
					</li>
					<li>
						<b>控制面板视角</b> — 你不是在跟 agent 聊天,你在指挥它工作
					</li>
					<li>
						<b>Panes 内嵌</b> — 和 terminal / file / diff pane
						平级共存,不霸占全屏
					</li>
				</ul>
			</div>
		</div>
	);
}

function App() {
	const [focused, setFocused] = useState(null);

	const onKey = useCallback((e) => {
		if (e.key === "Escape") setFocused(null);
	}, []);

	React.useEffect(() => {
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onKey]);

	const focusedVariant = focused
		? VARIANTS.find((v) => v.id === focused)
		: null;

	return (
		<div className="canvas">
			<div className="canvas__head">
				<div className="canvas__eyebrow">
					Superset · ACP Terminal Agent · 方向探索
				</div>
				<h1 className="canvas__title">
					面向程序员的 ACP session UI
					<br />
					<span className="accent">四个终端风方向,从保守到激进</span>
				</h1>
				<p className="canvas__lede">
					在同一份 mock ACP 会话数据上,用四种视觉语言并排渲染:一段用户
					prompt、一段 thinking、search + read + edit 三个 tool call、一个
					plan、一次 permission 请求(等待编辑授权)。 你可以逐个看细节,也可以按{" "}
					<span className="kbd">F</span> 或右上角 Focus
					单个放大到全屏对比。所有变体共享同一份 <code>MOCK_TIMELINE</code>
					,视觉差异 100% 来自设计选择,不来自内容差异。
				</p>
			</div>

			<AnalysisBlock />

			<div className="sep">四个方向</div>

			<div className="grid">
				{VARIANTS.map((v) => (
					<div key={v.id} className="frame">
						<div className="frame__label">
							<span className="frame__num">V{v.num}</span>
							<h3 className="frame__title">{v.title}</h3>
							<span className="frame__tag">{v.tag}</span>
							<button
								type="button"
								className="frame__focus"
								onClick={() => setFocused(v.id)}
							>
								Focus ⤢
							</button>
						</div>
						<p className="frame__desc">{v.desc}</p>
						<div className="pane-wrap">{v.render()}</div>
					</div>
				))}
			</div>

			{focusedVariant && (
				<div
					className="focus-overlay"
					onClick={(e) => {
						if (e.target.classList.contains("focus-overlay")) setFocused(null);
					}}
				>
					<div className="focus-overlay__bar">
						<span className="frame__num">V{focusedVariant.num}</span>
						<span style={{ color: "#eaeaee", fontSize: 14, fontWeight: 500 }}>
							{focusedVariant.title}
						</span>
						<span>{focusedVariant.tag}</span>
						<button
							type="button"
							className="focus-overlay__close"
							onClick={() => setFocused(null)}
						>
							Esc · 关闭
						</button>
					</div>
					<div className="focus-overlay__inner">{focusedVariant.render()}</div>
				</div>
			)}
		</div>
	);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
