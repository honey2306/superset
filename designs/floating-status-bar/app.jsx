/*
 * App entry — focused on Variant 01 (全宽悬浮条).
 * Header carries a "克制精致 / 彩色强调" toggle that flips [data-viz] on <body>,
 * which each variant reads via `[data-viz="vivid"] .v-*` selectors.
 */

const OTHER_VARIANTS = [
  {
    id: "02",
    title: "居中窄胶囊",
    tag: "Centered chip",
    note: "只占中间约 600px 的胶囊，两侧留白让 tab 内容露出来。",
    Component: window.VariantInset,
  },
  {
    id: "03",
    title: "卡片带进度",
    tag: "Card w/ progress",
    note: "全宽条 + 进度轨 + 步数计数，长任务驾驶舱。",
    Component: window.VariantCard,
  },
  {
    id: "04",
    title: "极简短条",
    tag: "Minimal pill",
    note: "只占内容左侧的一节短胶囊，宽度按内容自适应，视觉重量最轻。",
    Component: window.VariantInline,
  },
  {
    id: "05",
    title: "悬空隔板",
    tag: "Detached separator",
    note: "低对比玻璃条 + 下沿一根发光轨迹充当隔板。",
    Component: window.VariantSep,
  },
];

function ThemeToggle({ viz, setViz }) {
  return (
    <div className="theme-toggle" role="tablist" aria-label="视觉基调">
      <button
        className={viz === "calm" ? "is-active" : ""}
        onClick={() => setViz("calm")}
      >
        克制精致
      </button>
      <button
        className={viz === "vivid" ? "is-active" : ""}
        onClick={() => setViz("vivid")}
      >
        彩色强调
      </button>
    </div>
  );
}

function App() {
  const [viz, setViz] = React.useState("calm");
  React.useEffect(() => {
    document.body.setAttribute("data-viz", viz);
    try {
      localStorage.setItem("fsb-viz", viz);
    } catch (e) {}
  }, [viz]);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("fsb-viz");
      if (saved === "calm" || saved === "vivid") setViz(saved);
    } catch (e) {}
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Pi 悬浮状态栏 · 全宽条</h1>
          <p>
            锁定第 1 个方向（全宽悬浮条）。Agent 名改成描边胶囊（粉紫色边框 + 品牌色），
            左侧呼吸点保持橙色；圆角 8px + 三层投影 + hover 上抬 1px；
            右上角可以切换「克制精致 / 彩色强调」两版视觉基调。
          </p>
        </div>
        <ThemeToggle viz={viz} setViz={setViz} />
      </header>

      <section className="primary-variant">
        <window.Scene>
          <window.VariantTop />
        </window.Scene>
      </section>

      <details className="others">
        <summary>
          <span>其他 4 个方向</span>
          <span className="others-sub">02–05 · 备选方向，需要时展开对比</span>
        </summary>
        <div className="others-grid">
          {OTHER_VARIANTS.map(({ id, title, tag, note, Component }) => (
            <section
              key={id}
              className="variant"
              data-screen-label={`${id} · ${title}`}
            >
              <div className="variant-head">
                <span className="variant-index">{id}</span>
                <span className="variant-title">{title}</span>
                <span className="variant-tag">{tag}</span>
              </div>
              <p className="variant-note">{note}</p>
              <window.Scene>
                <Component />
              </window.Scene>
            </section>
          ))}
        </div>
      </details>

      <footer
        style={{
          color: "var(--text-faint)",
          fontSize: 12,
          textAlign: "center",
          paddingTop: 16,
          borderTop: "1px solid var(--border-soft)",
        }}
      >
        · Agent 名胶囊的颜色可以根据不同 agent 动态切换（Claude 粉紫、Pi 橙粉、Codex 青绿） ·
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
