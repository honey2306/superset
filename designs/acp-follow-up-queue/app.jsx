// app.jsx — 页面入口：并排展示三种变体
const { useState } = React;

function App() {
	const [layout, setLayout] = useState("compare"); // "compare" | "inline" | "rail" | "tape"

	const variants = [
		{
			id: "inline",
			label: "A · 内联 Queue Rail",
			desc: (
				<>
					队列 chip 直接挂在 composer 上方，与现有 <em>slash</em> /{" "}
					<em>mention</em> hint 同层视觉。Send 按钮在 streaming 时改为{" "}
					<em>Queue</em>，<em>⇧⌘⏎</em> 插到队首，<em>Cancel turn</em>{" "}
					保留原语义。
				</>
			),
			node: <VariantInline />,
		},
		{
			id: "rail",
			label: "B · 右侧队列面板",
			desc: (
				<>
					队列独立为右侧列，卡片视图适合 <em>拖拽排序</em> / <em>编辑</em> /{" "}
					<em>批量清空</em>。composer
					保持最简，运行状态徽章说明"回车会追加"。适合 power user 或 debug
					场景。
				</>
			),
			node: <VariantRail />,
		},
		{
			id: "tape",
			label: "C · Timeline Tape",
			desc: (
				<>
					queue 以时间线 tape 形式贴在 composer 上沿，chip 之间用 <em>→</em>{" "}
					连接表达"顺序执行"。强调"下一次输入将进入 timeline"，视觉最一体。
					<em>⌥⏎</em> 立即打断并发送。
				</>
			),
			node: <VariantTape />,
		},
	];

	const active = variants.find((v) => v.id === layout);

	return (
		<div className="fq-page">
			<header className="fq-topbar">
				<span className="fq-topbar__title">
					ACP · <b>Follow-up Queue</b> · 变体对比
				</span>
				<span className="fq-topbar__meta">
					streaming 期间用户如何追加下一条 · 3 种交互
				</span>
				<span className="fq-topbar__spacer" />
				<button
					className="fq-topbar__seg"
					data-active={layout === "compare"}
					onClick={() => setLayout("compare")}
				>
					并排对比
				</button>
				{variants.map((v) => (
					<button
						key={v.id}
						className="fq-topbar__seg"
						data-active={layout === v.id}
						onClick={() => setLayout(v.id)}
					>
						{v.id.toUpperCase()}
					</button>
				))}
			</header>

			{layout === "compare" ? (
				<main className="fq-grid" data-screen-label="compare">
					{variants.map((v) => (
						<section className="fq-frame" key={v.id} data-screen-label={v.id}>
							<div className="fq-frame__hd">
								<span className="fq-frame__label">
									VARIANT · <b>{v.id.toUpperCase()}</b>
								</span>
								<span className="fq-frame__title">
									{v.label.replace(/^\w · /, "")}
								</span>
							</div>
							<p className="fq-frame__desc">{v.desc}</p>
							<div className="fq-pane-shell">{v.node}</div>
						</section>
					))}
				</main>
			) : (
				<main
					className="fq-grid"
					style={{
						gridTemplateColumns: "minmax(720px, 1080px)",
						justifyContent: "center",
					}}
					data-screen-label={active.id}
				>
					<section className="fq-frame">
						<div className="fq-frame__hd">
							<span className="fq-frame__label">
								VARIANT · <b>{active.id.toUpperCase()}</b>
							</span>
							<span className="fq-frame__title">
								{active.label.replace(/^\w · /, "")}
							</span>
						</div>
						<p className="fq-frame__desc">{active.desc}</p>
						<div className="fq-pane-shell" style={{ height: 720 }}>
							{active.node}
						</div>
					</section>
				</main>
			)}

			<footer className="fq-footer">
				<span>
					<b style={{ color: "#8be9fd" }}>Streaming 场景</b> · agent
					正在流式输出，用户还想追加想法
				</span>
				<span>
					<span className="kbd">⏎</span> 追加到队列末尾
				</span>
				<span>
					<span className="kbd">⇧⌘⏎</span> 插到队首（Inline）
				</span>
				<span>
					<span className="kbd">⌥⏎</span> 立即打断并发送（Tape）
				</span>
			</footer>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
