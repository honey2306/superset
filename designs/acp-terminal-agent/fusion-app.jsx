// fusion-app.jsx — Canvas for the 02 + 03 fusion exploration
const { useState, useCallback } = React;

const FUSION_VARIANTS = [
	{
		id: "fu-main",
		num: "F01",
		title: "Fusion Main",
		tag: "推荐",
		desc: "以 03 的骨架为主(agent chip、breadcrumb、圆角面板、tool call kind 色板、diff hunk、plan checkbox),叠加 02 的信息密度手法(底部 vim-like status line、32px slim rail 做类别过滤)。配色不用 phosphor 绿也不用紫 —— warm dark #161719 + amber #f0b429 + 冷青 #5eead4,和 Claude/Codex/OpenCode 都拉开距离。",
		render: () => <window.FusionMain />,
	},
	{
		id: "fu-dense",
		num: "F02",
		title: "Fusion Dense",
		tag: "密度更高变体",
		desc: "同一套配色和视觉语言,但 gutter 加宽到 44px 带 badge 计数、字号 -0.5px、行距 -8%、每条 timeline 保留 20px type letter 列。信息密度接近纯 TUI,适合喜欢 tmux/vim 状态感的重度使用者。",
		render: () => <window.FusionDense />,
	},
];

function FusionMap() {
	const rows = [
		{
			kw: "from02",
			label: "02 保留",
			desc: (
				<span>
					<b>底部 vim-like status line</b> — mode / model / token 进度条 /
					branch / conn 一眼看完
				</span>
			),
		},
		{
			kw: "from02",
			label: "02 保留",
			desc: (
				<span>
					<b>Slim rail 类别过滤</b> — 32px 宽的窄条(F01)或 44px 带计数(F02),用作
					timeline / plan / tool / files / perm 跳锚
				</span>
			),
		},
		{
			kw: "from02",
			label: "02 保留",
			desc: (
				<span>
					<b>每 item type letter</b> — F02 版每行左侧 20px 独立 type
					列(U/A/⚙/◫/▲),快速扫读
				</span>
			),
		},
		{
			kw: "from03",
			label: "03 保留",
			desc: (
				<span>
					<b>Agent chip + breadcrumb</b> — 顶部"Claude Code · Sonnet 4.5" 胶囊 +
					"superset › branch" 面包屑
				</span>
			),
		},
		{
			kw: "from03",
			label: "03 保留",
			desc: (
				<span>
					<b>Tool call kind 色板卡片</b> — read=青 / edit=琥珀 / search=紫 /
					execute=绿,最重要的信号增强
				</span>
			),
		},
		{
			kw: "from03",
			label: "03 保留",
			desc: (
				<span>
					<b>规整 Diff hunk</b> — 路径 header + ± stat + 行背景 + 行号 gutter
				</span>
			),
		},
		{
			kw: "from03",
			label: "03 保留",
			desc: (
				<span>
					<b>真 checkbox 的 Plan</b> — 不是 [ ][x] ASCII,是有形状/圆角的方框
				</span>
			),
		},
		{
			kw: "drop",
			label: "两边都放",
			desc: (
				<span>
					<s>02 的 phosphor 绿</s> — 太复古退休感,不够专业
				</span>
			),
		},
		{
			kw: "drop",
			label: "两边都放",
			desc: (
				<span>
					<s>03 的紫色 accent</s> — 太通用,和 Codex CLI 撞
				</span>
			),
		},
		{
			kw: "new",
			label: "新增",
			desc: (
				<span>
					<b>Amber (#f0b429) + Teal (#5eead4)</b> — Warp/Ghostty
					系配色但更暖,Superset 自有识别度
				</span>
			),
		},
		{
			kw: "new",
			label: "新增",
			desc: (
				<span>
					<b>Amber pulse permission</b> — 借 V4
					的手法但换成琥珀而非橙,更成熟不刺眼
				</span>
			),
		},
		{
			kw: "new",
			label: "新增",
			desc: (
				<span>
					<b>Tool call footer</b> — "auto-approved (read-only)"
					明示自动放行原因,可审计
				</span>
			),
		},
	];
	return (
		<div className="fusion-note">
			<div>
				<h4>融合思路</h4>
				<div className="from">
					融合不是把两套都放上去 — 那样只会更乱。
					<br />
					<br />
					我按<b>信号价值</b>拣选:
					<br />
					<br />
					<span className="amber">保留</span>能提升可扫读性的手法(kind
					色板、breadcrumb、checkbox、status line、rail)。
					<br />
					<br />
					<span className="teal">丢弃</span>纯装饰或撞色的部分(phosphor
					绿、通用紫、多余的 gutter 宽度)。
					<br />
					<br />
					<b>换新</b>只在必要处 — 配色让 Superset 有自己的识别度。
				</div>
			</div>
			<div className="fusion-map">
				{rows.map((r, i) => (
					<div key={i} className="row">
						<span className={`kw ${r.kw}`}>{r.label}</span>
						<span className="desc">{r.desc}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function FusionApp() {
	const [focused, setFocused] = useState(null);

	const onKey = useCallback((e) => {
		if (e.key === "Escape") setFocused(null);
	}, []);

	React.useEffect(() => {
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onKey]);

	const focusedVariant = focused
		? FUSION_VARIANTS.find((v) => v.id === focused)
		: null;

	return (
		<div className="fusion-canvas">
			<div className="canvas__head">
				<div className="canvas__eyebrow">
					Superset · ACP Terminal Agent · 融合 v2
				</div>
				<h1 className="canvas__title">
					02 + 03 融合
					<br />
					<span className="accent">Warm dark · Amber · Teal</span>
				</h1>
				<p className="canvas__lede">
					你选了 02(Split TUI · OpenCode 风)和 03(Modern Editor · Zed
					风)。它们各自的价值不同 —— 02 强在
					<b style={{ color: "#eaeaee" }}>信息密度</b>(gutter + status line +
					type letter), 03 强在
					<b style={{ color: "#eaeaee" }}>精致度与可扫读性</b>(kind
					色板、圆角面板、真 checkbox)。
					直接叠加会得到一个又挤又花的界面。我用一份"信号价值"清单做取舍,
					得到下面两个变体:<b style={{ color: "#eaeaee" }}>Fusion Main</b>{" "}
					更平衡,推荐作为落地起点;
					<b style={{ color: "#eaeaee" }}>Fusion Dense</b> 更 TUI 感,给喜欢
					tmux/vim 感的重度使用者。
				</p>
			</div>

			<FusionMap />

			<div className="fusion-grid">
				{FUSION_VARIANTS.map((v) => (
					<div key={v.id} className="frame fusion-frame">
						<div className="frame__label">
							<span className="frame__num">{v.num}</span>
							<h3 className="frame__title">{v.title}</h3>
							<span
								className="frame__tag"
								style={v.id === "fu-main" ? { color: "#f0b429" } : {}}
							>
								{v.tag}
							</span>
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

			<div
				style={{
					marginTop: 60,
					color: "#7a7a82",
					fontSize: 12,
					lineHeight: 1.7,
					maxWidth: 780,
				}}
			>
				对比第一版(4 个方向):
				<a href="ACP%20Terminal%20Agent.html" style={{ color: "#5eead4" }}>
					ACP Terminal Agent.html
				</a>
				<br />
				本页 = 你选定后的融合探索,用同一份 mock ACP 会话数据渲染,可以{" "}
				<span className="kbd">Focus ⤢</span> 单个放大到全屏,
				<span className="kbd">Esc</span> 关闭。
			</div>

			{focusedVariant && (
				<div
					className="focus-overlay"
					onClick={(e) => {
						if (e.target.classList.contains("focus-overlay")) setFocused(null);
					}}
				>
					<div className="focus-overlay__bar">
						<span className="frame__num">{focusedVariant.num}</span>
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
root.render(<FusionApp />);
