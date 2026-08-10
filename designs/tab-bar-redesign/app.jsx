// Top-level page — three full app frames stacked, each with a different
// tab-bar variant so you can judge fit-in-context, not just the bar alone.

function VariantBlock({ badge, title, desc, variant }) {
	const [active, setActive] = React.useState(DEFAULT_ACTIVE);
	return (
		<section className="variant-section">
			<div>
				<span className="variant-badge">{badge}</span>
				<span className="variant-title">{title}</span>
			</div>
			<AppShell>
				<TabBar
					variant={variant}
					tabs={DEMO_TABS}
					activeId={active}
					onSelect={setActive}
				/>
			</AppShell>
			<p className="variant-caption">{desc}</p>
		</section>
	);
}

function App() {
	return (
		<div className="page">
			<header>
				<h1 className="page-title">Tab Bar Redesign · 完整环境对比</h1>
				<p className="page-lede">
					上一轮的设计单独看还行,放到整个 app 里立刻不搭 — 因为 Superset 现在
					整体是极端 flat 的语言(没有 elevation、没有阴影、圆角很少,pink
					只在文字段头和小 chip outline 上用)。这轮三版都对齐这个语言: 没有
					pill、没有 shadow、没有 highlight border,只用最轻的方式区分
					激活态。tab bar 里点击可切换 active tab。
				</p>
			</header>

			<VariantBlock
				badge="A"
				title="Underline · 底部一根 pink 细线"
				variant="a-underline"
				desc="和你右侧 Changes/Files 面板完全同款的语言:tab 完全平,active 只在底部有一根 pink underline。零改动风险,融入度最高;唯一缺点是当 tab 数量多时,靠一根短线定位当前 tab 需要眼睛扫一下底边。"
			/>

			<VariantBlock
				badge="B"
				title="Ghost fill · dim 底色 + 短 hairline"
				variant="b-ghost"
				desc="Active tab 有一层 dim 底色(--panel,和 sidebar active item 同一色阶),再配一条 pink underline。非激活 tab 之间用极淡的 hairline 隔开(active/hover 两侧自动隐藏)。层级感比 A 强一点,但依然完全 flat,没有 border 或 shadow。个人觉得视觉噪音和识别度之间平衡最好。"
			/>

			<VariantBlock
				badge="C"
				title="Left tick · 左侧 pink 竖标记(和 sidebar 同款)"
				variant="c-tick"
				desc="Active tab 左边加一根 2px pink 竖标记 —— 这就是左侧 sidebar 里 active workspace item 的语言,直接复用。tab 本身有极淡的 pink tint 底色(5%)。视觉上和整个 app 最一致(sidebar + tab bar 共用一套 active 语言),但要看你能否接受 active 靠左侧一个竖线定位这种阅读习惯。"
			/>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
