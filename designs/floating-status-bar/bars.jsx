/*
 * Five variants of the tab-scoped floating status bar. They all live in the
 * tab content region (below the tab bar, above the composer) and use different
 * "float postures" to visually detach from the chrome on both sides.
 *
 * Common payload: agent icon, agent name, status line, generic controls
 * (停止 / 打开 / 更多), and the split-view toggle carried from the current
 * chrome. No approval affordance.
 */

const IconStop = () =>
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>;

const IconMore = () =>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>;

const IconArrow = () =>
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;

const IconOpen = () =>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <path d="M14 4h6v6M20 4L10 14M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;

/* ---------- Pi mark — 3 style variants ---------- */
function PiMarkA({ size = "md" }) {
  // Style A: geometric line-art π on a soft glow.
  return (
    <span className={`pi-mark style-a ${size === "lg" ? "lg" : size === "sm" ? "sm" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 7h15" />
        <path d="M9 7v10.5c0 .5-.4 1-1 1H7" />
        <path d="M15.5 7l-.5 10c-.03.6.3 1.5 1.2 1.5.6 0 1.1-.3 1.3-.9" />
      </svg>
    </span>
  );
}
function PiMarkB({ size = "md" }) {
  // Style B: circular brand badge with a serif italic π glyph.
  return (
    <span className={`pi-mark style-b ${size === "lg" ? "lg" : size === "sm" ? "sm" : ""}`}>
      <span className="pi-glyph">π</span>
    </span>
  );
}
function PiMarkC({ size = "md" }) {
  // Style C: rounded-square app-icon shape with the same π glyph.
  return (
    <span className={`pi-mark style-c ${size === "lg" ? "lg" : size === "sm" ? "sm" : ""}`}>
      <span className="pi-glyph">π</span>
    </span>
  );
}
const PI_MARKS = { A: PiMarkA, B: PiMarkB, C: PiMarkC };

/* ---------- Variant 1: Full-width floating bar ---------- */
function VariantTop({ piStyle = "A" }) {
  const [elapsed, setElapsed] = React.useState(0);
  const [isRunning, setIsRunning] = React.useState(true);

  React.useEffect(() => {
    if (!isRunning) return;
    const start = Date.now() - elapsed * 1000;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const formatTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="v v-top">
      <span className="bar-status">
        <span className="agent-badge">Pi</span>
        <span className="txt">请求提供项目信息</span>
      </span>
      <div className="bar-actions">
        <span className="elapsed-time">{formatTime(elapsed)}</span>
        <button className="icon-btn" title="分屏"><IconSplit /></button>
      </div>
    </div>
  );
}

/* ---------- Variant 2: Centered inset chip ---------- */
function VariantInset() {
  return (
    <div className="v v-inset">
      <span className="pi-icon sm">Pi</span>
      <span className="bar-status">
        <span className="live" />
        <span className="label">Pi</span>
        <span className="txt">请求提供项目信息</span>
      </span>
      <div className="bar-actions">
        <button className="icon-btn" title="停止"><IconStop /></button>
        <button className="icon-btn" title="更多"><IconMore /></button>
        <span className="hair-divider" />
        <button className="icon-btn" title="分屏"><IconSplit /></button>
      </div>
    </div>
  );
}

/* ---------- Variant 3: Rounded card with progress ---------- */
function VariantCard() {
  return (
    <div className="v v-card">
      <span className="pi-icon lg">Pi</span>
      <span className="bar-status" style={{ minWidth: 180 }}>
        <span className="live" />
        <span className="label">Pi</span>
        <span className="txt">请求提供项目信息</span>
      </span>
      <div className="progress-track">
        <div className="progress-fill" />
      </div>
      <span className="count"><b>07</b>/12 步</span>
      <div className="bar-actions">
        <button className="pill-btn ghost" title="停止"><IconStop /></button>
        <button className="pill-btn">跳转到会话 <IconArrow /></button>
        <span className="hair-divider" />
        <button className="icon-btn" title="分屏"><IconSplit /></button>
      </div>
    </div>
  );
}

/* ---------- Variant 4: Minimal short pill (left) ---------- */
function VariantInline() {
  return (
    <div className="v v-inline">
      <span className="pi-icon sm">Pi</span>
      <span className="bar-status">
        <span className="txt">
          <b style={{ fontWeight: 600, color: "var(--text-strong)" }}>Pi</b> · 请求提供项目信息
        </span>
      </span>
      <span className="divider" />
      <div className="actions">
        <button className="icon-btn" title="停止"><IconStop /></button>
        <button className="icon-btn" title="更多"><IconMore /></button>
        <span className="divider" />
        <button className="icon-btn" title="分屏"><IconSplit /></button>
      </div>
    </div>
  );
}

/* ---------- Variant 5: Detached separator with glowing rail ---------- */
function VariantSep() {
  return (
    <div className="v v-sep">
      <span className="pi-icon sm">Pi</span>
      <span className="bar-status">
        <span className="txt">
          <b style={{ fontWeight: 600, color: "var(--text-strong)" }}>Pi</b> · 请求提供项目信息
        </span>
      </span>
      <span className="step"><b>07</b> / 12</span>
      <div className="bar-actions">
        <button className="pill-btn ghost" title="停止"><IconStop /> 停止</button>
        <button className="pill-btn">跳转到会话 <IconArrow /></button>
        <span className="hair-divider" />
        <button className="icon-btn" title="分屏"><IconSplit /></button>
      </div>
    </div>
  );
}

Object.assign(window, {
  VariantTop,
  VariantInset,
  VariantCard,
  VariantInline,
  VariantSep,
  PiMarkA,
  PiMarkB,
  PiMarkC,
  PI_MARKS,
});
