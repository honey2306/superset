const {
  Icon: DsIcon,
  IconButton: DsIconButton,
  Badge: DsBadge,
  Avatar: DsAvatar,
  Kbd: DsKbd,
} = window.SupersetDesignSystem_91a6da;

const browserPageData = window.agentBrowserPages;
const variantData = window.prototypeVariants;

function PrototypeTopbar() {
  return (
    <header className="prototype-topbar">
      <div className="traffic-lights" aria-hidden="true">
        <span className="traffic-light"></span>
        <span className="traffic-light"></span>
        <span className="traffic-light"></span>
      </div>
      <div className="product-mark">
        <DsIcon name="spark" size={13} className="product-mark__glyph" />
        Superset
      </div>
      <div className="workspace-crumb">superset / agent-browser-prototype</div>
      <div className="topbar-spacer"></div>
      <div className="prototype-badge">
        <span className="live-dot"></span>
        Claude Code · working
      </div>
    </header>
  );
}

function WorkspaceTabbar() {
  return (
    <div className="workspace-tabbar">
      <div className="workspace-tab is-active">
        <span className="status-dot"></span>
        内置 Agent Browser
        <span className="workspace-tab__close"><DsIcon name="x" size={10} /></span>
      </div>
      <div className="workspace-tab">Terminal</div>
      <div className="workspace-tab-add"><DsIcon name="plus" size={11} /></div>
    </div>
  );
}

function PaneToolbar({ title, subtitle, browserActive = false, trailing }) {
  return (
    <div className="pane-toolbar">
      <div className="agent-chip" data-browser-active={browserActive}>
        <span className="agent-chip__dot"></span>
        {browserActive ? "Agent Browser" : "Claude Code"}
      </div>
      <div className="pane-title">{title}</div>
      {subtitle ? <div className="pane-subtitle">{subtitle}</div> : null}
      <div className="pane-spacer"></div>
      {trailing}
    </div>
  );
}

function ToolRow({ iconName, kind, label, meta, active = false }) {
  return (
    <div className={`tool-row${active ? " is-active" : ""}`}>
      <DsIcon name={iconName} size={12} />
      <span className="tool-row__kind">{kind}</span>
      <span className="tool-row__label">{label}</span>
      <span className="tool-row__meta">{meta}</span>
    </div>
  );
}

function ConversationBody({ condensed = false }) {
  if (condensed) {
    return (
      <div className="focus-thread__timeline">
        <div className="chat-user">帮我实现内置浏览器，让 Agent 验证 localhost。</div>
        <div className="agent-message">
          <div className="message-author">
            <span className="message-author__mark"><DsIcon name="spark" size={11} /></span>
            Claude
          </div>
          <div>我先检查当前 ACP pane 和 Browser Use 的连接方式。</div>
        </div>
        <ToolRow iconName="file" kind="Read" label="PanesWorkspace" meta="" />
        <ToolRow iconName="terminal" kind="Run" label="bun dev" meta="" />
        <ToolRow iconName="cloud" kind="Browser" label="localhost:5173" meta="" active />
        <div className="agent-message">页面已经打开，正在验证 workspace 创建流程。</div>
      </div>
    );
  }

  return (
    <div className="chat-stream">
      <div className="chat-inner">
        <div className="chat-user">
          帮我实现内置浏览器。主要给 Agent 用，我只需要知道它正在操作什么；一个对话可能打开很多页面。
        </div>
        <div className="agent-message">
          <div className="message-author">
            <span className="message-author__mark"><DsIcon name="spark" size={11} /></span>
            Claude
          </div>
          <div>
            我会先启动本地 app，再用 Browser 验证 workspace 创建流程。浏览器属于当前对话，页面不会进入 Superset 顶层 tabs。
          </div>
        </div>
        <div>
          <ToolRow iconName="file" kind="Read" label="apps/desktop/src/renderer/…/PanesWorkspace" meta="240 lines" />
          <ToolRow iconName="terminal" kind="Run" label="bun dev" meta="running" />
          <ToolRow iconName="cloud" kind="Browser" label="localhost:5173/workspace/agent-browser" meta="5 pages" active />
        </div>
        <div className="agent-message">
          <div>Browser pane 已经绑定当前 ACP session。现在检查多页面切换和关闭后的恢复行为。</div>
        </div>
      </div>
    </div>
  );
}

function Composer() {
  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="composer-placeholder">继续告诉 Agent 要检查什么…</div>
        <div className="composer-actions">
          <DsBadge pill>default</DsBadge>
          <DsBadge pill>Sonnet 4.6</DsBadge>
          <div className="composer-actions__spacer"></div>
          <DsKbd>⌘↵</DsKbd>
          <button className="send-button" aria-label="发送"><DsIcon name="arrowRight" size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function ChatPane({ onShowBrowser, hideToolbar = false, browserVisible = false }) {
  return (
    <section className="pane chat-pane" data-screen-label="ACP Conversation">
      {!hideToolbar ? (
        <PaneToolbar
          title="内置 Agent Browser"
          subtitle="acp-session: 885ad7c1"
          trailing={
            <div className="pane-toolbar-actions">
              <button
                className={`fixed-browser-trigger${browserVisible ? " is-open" : ""}`}
                onClick={onShowBrowser}
                title={browserVisible ? "收起 Agent Browser" : "查看 Agent Browser"}
                aria-pressed={browserVisible}
              >
                <span className="agent-chip__dot"></span>
                <DsIcon name="cloud" size={12} />
                <span>Browser</span>
                <span className="fixed-browser-trigger__count">5</span>
              </button>
              <DsIconButton title="更多"><DsIcon name="moreH" size={13} /></DsIconButton>
            </div>
          }
        />
      ) : null}
      <ConversationBody />
      <Composer />
    </section>
  );
}

function MockAppPage() {
  return (
    <div className="mock-site app">
      <div className="site-app-top">
        <div className="site-brand">Superset</div>
        <div className="site-nav"><span className="active">Workspaces</span><span>Tasks</span><span>Automations</span></div>
        <div className="site-avatar">WF</div>
      </div>
      <div className="site-app-body">
        <aside className="site-sidebar">
          <div className="site-side-label active">agent-browser</div>
          <div className="site-side-label">main</div>
          <div className="site-side-label">browser-use-mcp</div>
          <div className="site-side-label">desktop-shell</div>
        </aside>
        <main className="site-main">
          <div className="site-heading">
            <div><h1>Agent Browser</h1><p>Workspace activity and browser verification</p></div>
            <button className="site-primary">New workspace</button>
          </div>
          <div className="metric-grid">
            <div className="metric-card"><div className="metric-label">Active agents</div><div className="metric-value">3</div></div>
            <div className="metric-card"><div className="metric-label">Browser pages</div><div className="metric-value">5</div></div>
            <div className="metric-card"><div className="metric-label">Checks passed</div><div className="metric-value">12</div></div>
          </div>
          <div className="activity-card">
            <div className="activity-title">Recent activity</div>
            <div className="activity-row"><strong>Browser pane mounted</strong><span>Claude</span><span>now</span></div>
            <div className="activity-row"><strong>Workspace created</strong><span>Codex</span><span>2m</span></div>
            <div className="activity-row"><strong>Typecheck completed</strong><span>Pi</span><span>6m</span></div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MockGenericPage({ browserPage }) {
  const genericCopy = {
    github: ["Pull request #8421", "feat(desktop): add conversation-scoped agent browser", "This change introduces one Browser companion pane per ACP session. Browser pages remain internal to the session and never become workspace tabs."],
    docs: ["Electron Documentation", "WebContentsView", "A view that displays web content. Browser runtime ownership stays in the main process while the renderer only controls layout and visibility."],
    linear: ["SUPER-1842", "Add built-in browser for agent workflows", "Users should be able to see what the agent is doing without managing a second external browser window."],
    search: ["Search", "WebContentsView pointer events", "Results about view bounds, focus handling, draggable panes, background throttling, and Electron lifecycle management."],
  }[browserPage.kind] || [browserPage.domain, browserPage.title, browserPage.url];

  return (
    <div className="mock-site mock-generic">
      <div className="mock-generic__eyebrow">{genericCopy[0]}</div>
      <h1>{genericCopy[1]}</h1>
      <p>{genericCopy[2]}</p>
      <div className="mock-generic__card">
        <strong>Agent note</strong>
        <p>此页面保留在当前 browser session 中。Agent 切换页面时，Browser pane 自动跟随 active page。</p>
        <div className="mock-code">browser.select_page("{browserPage.id}")<br />browser.page_info() → {browserPage.domain}</div>
      </div>
    </div>
  );
}

function PagePopover({ activePageId, onSelect, onDismiss }) {
  return (
    <div className="pages-popover">
      <div className="pages-popover__head"><span>Browser pages</span><span>{browserPageData.length}</span></div>
      <div className="page-list">
        {browserPageData.map((browserPage) => (
          <button
            className={`page-row${browserPage.id === activePageId ? " is-active" : ""}`}
            key={browserPage.id}
            onClick={() => { onSelect(browserPage.id); onDismiss(); }}
          >
            <span className="page-favicon"><DsIcon name={browserPage.kind === "github" ? "branch" : browserPage.kind === "docs" ? "file" : browserPage.kind === "search" ? "search" : "cloud"} size={12} /></span>
            <span className="page-copy">
              <span className="page-title">{browserPage.title}</span>
              <span className="page-meta">{browserPage.domain} · {browserPage.activity}</span>
            </span>
            <span className={`page-state${browserPage.id === activePageId ? " is-live" : ""}`}>{browserPage.id === activePageId ? "active" : browserPage.state === "temporary" ? "temp" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BrowserPane({ activePageId, onSelectPage, onClose, focusMode = false }) {
  const [pageMenuOpen, setPageMenuOpen] = React.useState(false);
  const currentBrowserPage = browserPageData.find((item) => item.id === activePageId) || browserPageData[0];
  const nextPage = () => {
    const currentIndex = browserPageData.findIndex((item) => item.id === activePageId);
    onSelectPage(browserPageData[(currentIndex + 1) % browserPageData.length].id);
  };

  return (
    <section className="pane browser-pane" data-screen-label="Agent Browser">
      <div className="browser-toolbar">
        <div className="nav-group">
          <button className="icon-plain" aria-label="后退"><span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><DsIcon name="arrowRight" size={12} /></span></button>
          <button className="icon-plain" aria-label="前进"><DsIcon name="arrowRight" size={12} /></button>
          <button className="icon-plain" aria-label="刷新"><DsIcon name="refresh" size={12} /></button>
        </div>
        <div className="browser-location">
          <span className="browser-location__secure"></span>
          <span className="browser-location__url">{currentBrowserPage.url}</span>
        </div>
        <button className="pages-trigger" data-open={pageMenuOpen} onClick={() => setPageMenuOpen((value) => !value)}>
          <DsIcon name="file" size={12} />
          <span className="pages-count">{browserPageData.length} pages</span>
          <DsIcon name="chevron" size={11} />
        </button>
        <button className="icon-plain" title="模拟 Agent 切换页面" onClick={nextPage}><DsIcon name="spark" size={12} /></button>
        {focusMode ? null : <button className="icon-plain" title="隐藏 Browser" onClick={onClose}><DsIcon name="x" size={12} /></button>}
      </div>
      <div className="browser-surface">
        <div className="agent-control-banner"><span className="agent-chip__dot"></span>Agent 正在操作 · {currentBrowserPage.shortTitle}</div>
        {currentBrowserPage.kind === "app" ? <MockAppPage /> : <MockGenericPage browserPage={currentBrowserPage} />}
        <div className="agent-cursor"></div>
      </div>
      {pageMenuOpen ? <PagePopover activePageId={activePageId} onSelect={onSelectPage} onDismiss={() => setPageMenuOpen(false)} /> : null}
    </section>
  );
}

function VariantSplit({ activePageId, onSelectPage }) {
  const [browserVisible, setBrowserVisible] = React.useState(false);
  return (
    <div className="workspace-content" data-screen-label="Variant A — Companion Pane">
      {browserVisible ? (
        <div className="variant-split">
          <ChatPane onShowBrowser={() => setBrowserVisible(false)} browserVisible />
          <div className="split-divider" title="可调整分屏宽度"></div>
          <BrowserPane activePageId={activePageId} onSelectPage={onSelectPage} onClose={() => setBrowserVisible(false)} />
        </div>
      ) : (
        <ChatPane onShowBrowser={() => setBrowserVisible(true)} />
      )}
    </div>
  );
}

function VariantDock({ activePageId, onSelectPage }) {
  const [dockCollapsed, setDockCollapsed] = React.useState(false);
  return (
    <div className="workspace-content variant-dock" data-screen-label="Variant B — Conversation Dock">
      <ChatPane hideToolbar onShowBrowser={() => setDockCollapsed(false)} />
      <div className={`browser-dock${dockCollapsed ? " is-collapsed" : ""}`}>
        <button className="dock-handle" onClick={() => setDockCollapsed((value) => !value)}>
          <span className="dock-handle__grab"></span>
          <span className="agent-chip" data-browser-active="true"><span className="agent-chip__dot"></span></span>
          <span className="dock-handle__title">Agent Browser</span>
          <span className="dock-handle__meta">{browserPageData.length} pages · {dockCollapsed ? "隐藏" : "正在操作"}</span>
          <span className="pane-spacer"></span>
          <DsIcon name="chevron" size={12} />
        </button>
        <BrowserPane activePageId={activePageId} onSelectPage={onSelectPage} onClose={() => setDockCollapsed(true)} />
      </div>
    </div>
  );
}

function VariantFocus({ activePageId, onSelectPage }) {
  const [focusSurface, setFocusSurface] = React.useState("browser");
  return (
    <div className="workspace-content variant-focus" data-screen-label="Variant C — Browser Focus">
      <aside className="focus-thread">
        <div className="focus-thread__head">
          <div className="focus-thread__title">内置 Agent Browser</div>
          <div className="focus-thread__meta">Claude Code · working · 885ad7c1</div>
        </div>
        <ConversationBody condensed />
        <div className="focus-thread__composer"><div className="focus-thread__input">发送消息…</div></div>
      </aside>
      <main className="focus-browser pane">
        <PaneToolbar
          title={focusSurface === "browser" ? "Agent Browser" : "Conversation"}
          subtitle={focusSurface === "browser" ? `${browserPageData.length} pages · session 885ad7c1` : "完整对话"}
          browserActive={focusSurface === "browser"}
          trailing={
            <div className="focus-mode-switch">
              <button className={focusSurface === "chat" ? "is-active" : ""} onClick={() => setFocusSurface("chat")}>对话</button>
              <button className={focusSurface === "browser" ? "is-active" : ""} onClick={() => setFocusSurface("browser")}>Browser</button>
            </div>
          }
        />
        {focusSurface === "browser" ? (
          <BrowserPane activePageId={activePageId} onSelectPage={onSelectPage} focusMode />
        ) : (
          <ChatPane hideToolbar onShowBrowser={() => setFocusSurface("browser")} />
        )}
      </main>
    </div>
  );
}

function VariantSwitcher({ selectedVariant, onSelectVariant }) {
  const selectedIndex = variantData.findIndex((item) => item.key === selectedVariant);
  const cycleVariant = (direction) => {
    const nextIndex = (selectedIndex + direction + variantData.length) % variantData.length;
    onSelectVariant(variantData[nextIndex].key);
  };

  return (
    <>
      <div className="variant-switcher">
        <button className="variant-nav" onClick={() => cycleVariant(-1)} aria-label="上一个方案"><span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><DsIcon name="arrowRight" size={12} /></span></button>
        <div className="variant-options">
          {variantData.map((item) => (
            <button key={item.key} className={`variant-option${item.key === selectedVariant ? " is-active" : ""}`} onClick={() => onSelectVariant(item.key)}>
              <span className="variant-option__key">{item.key}</span>
              <span className="variant-option__name">{item.name}</span>
            </button>
          ))}
        </div>
        <button className="variant-nav" onClick={() => cycleVariant(1)} aria-label="下一个方案"><DsIcon name="arrowRight" size={12} /></button>
      </div>
      <div className="variant-caption">← → 切换方案 · 点击 5 pages 查看多页面</div>
    </>
  );
}

function AgentBrowserPrototypeApp() {
  const initialVariantKey = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
  const validInitialVariant = variantData.some((item) => item.key === initialVariantKey) ? initialVariantKey : "A";
  const [selectedVariant, setSelectedVariant] = React.useState(validInitialVariant);
  const [activePageId, setActivePageId] = React.useState("local");

  const selectVariant = React.useCallback((variantKey) => {
    setSelectedVariant(variantKey);
    const prototypeUrl = new URL(window.location.href);
    prototypeUrl.searchParams.set("variant", variantKey.toLowerCase());
    window.history.replaceState({}, "", prototypeUrl);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (keyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (["INPUT", "TEXTAREA"].includes(activeTag) || document.activeElement?.isContentEditable) return;
      if (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight") return;
      const currentIndex = variantData.findIndex((item) => item.key === selectedVariant);
      const direction = keyboardEvent.key === "ArrowRight" ? 1 : -1;
      selectVariant(variantData[(currentIndex + direction + variantData.length) % variantData.length].key);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVariant, selectVariant]);

  return (
    <div className="prototype-shell">
      <PrototypeTopbar />
      <div className="stage">
        <div className="workspace-frame">
          <WorkspaceTabbar />
          {selectedVariant === "A" ? <VariantSplit activePageId={activePageId} onSelectPage={setActivePageId} /> : null}
          {selectedVariant === "B" ? <VariantDock activePageId={activePageId} onSelectPage={setActivePageId} /> : null}
          {selectedVariant === "C" ? <VariantFocus activePageId={activePageId} onSelectPage={setActivePageId} /> : null}
        </div>
      </div>
      <VariantSwitcher selectedVariant={selectedVariant} onSelectVariant={selectVariant} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AgentBrowserPrototypeApp />);
