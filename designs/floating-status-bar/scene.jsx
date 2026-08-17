/*
 * Scene — reproduces the app chrome from the screenshot: title bar with
 * agent tabs on the left, Run button and split-view toggle on the right,
 * and a feed of tool-call rows underneath. Used as the backdrop that each
 * floating status bar overlays on top of.
 */

const IconChevron = ({ size = 12 }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;

const IconPlay = ({ size = 11 }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>;

const IconPlus = ({ size = 14 }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;

const IconGear = ({ size = 14 }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.6" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.06a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.06a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.4" />
  </svg>;

const IconSidebar = ({ size = 14 }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
  </svg>;

const IconSplit = ({ size = 14 }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 4v16" stroke="currentColor" strokeWidth="1.6" />
  </svg>;

const IconRead = () =>
  <span style={{
    display: "inline-flex",
    width: 14,
    justifyContent: "center",
    color: "var(--text-faint)",
    fontFamily: "var(--font-mono)",
  }}>›</span>;

function Titlebar() {
  return (
    <div className="scene-titlebar">
      <div className="traffic"><span /><span /><span /></div>
      <div className="tb-tabs">
        <div className="tb-tab">
          <span className="dot" style={{ background: "#ff9d55" }}>*</span>
          <span>claude</span>
        </div>
        <div className="tb-tab">
          <span className="dot" style={{ background: "#7fdbca", color: "#0b3d38" }}>◈</span>
          <span>codex</span>
        </div>
        <div className="tb-tab">
          <span className="dot" style={{ background: "#f38ba8" }}>Pi</span>
          <span>pi</span>
        </div>
        <div className="tb-tab is-active">
          <span className="dot" style={{ background: "#0f766e", color: "#a7f3d0" }}>M</span>
          <span>MyFlicker</span>
        </div>
        <button className="tb-plus" aria-label="new"><IconPlus size={14} /></button>
        <button className="tb-gear" aria-label="settings"><IconGear size={14} /></button>
      </div>
      <div className="tb-right">
        <button className="tb-run">
          <IconPlay />
          <span>Run</span>
        </button>
        <button className="tb-caret" aria-label="more run"><IconChevron size={10} /></button>
      </div>
    </div>
  );
}

function FeedRow({ path, tool = "Read", status = "completed", pending, dim }) {
  return (
    <div className={`feed-row${pending ? " pending" : ""}${dim ? " dim" : ""}`}>
      <IconRead />
      <span className="path">
        <b>{tool}</b>&nbsp; {path}
      </span>
      <span className="status">{status}</span>
    </div>
  );
}

function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Composer() {
  return (
    <div className="scene-composer">
      <span className="preset active"><span className="swatch" />Pi 预设</span>
      <span className="preset">Plan</span>
      <span className="preset">Deep dive</span>
      <div className="field">提交你的想法…</div>
      <button className="send" aria-label="send"><IconSend /></button>
    </div>
  );
}

function Scene({ children, feedTop = 24 }) {
  return (
    <div className="scene">
      <Titlebar />
      <div className="scene-body">
        <div className="scene-feed" style={{ paddingTop: feedTop }}>
          <FeedRow tool="Read" path="/Users/wufan/Code/mini-krow/apps/krowd/src/main.rs" dim />
          <FeedRow tool="Read" path="/Users/wufan/Code/mini-krow/apps/desktop/src/renderer/App.tsx" />
          <FeedRow tool="Grep" path="pattern='useEffect' in apps/desktop/src/renderer/hooks" />
          <FeedRow tool="Edit" path="apps/desktop/src/renderer/components/StatusBar/StatusBar.tsx" />
          <FeedRow tool="Bash" path="bun run typecheck" status="running…" pending />
        </div>
        <Composer />
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { Scene, IconChevron, IconPlay, IconPlus, IconGear, IconSidebar, IconSplit });
