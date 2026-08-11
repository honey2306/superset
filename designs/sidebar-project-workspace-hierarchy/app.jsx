const { Toast } = window.SupersetDesignSystem_91a6da;
const { sidebarVariantInfo: variantCards } = window.SidebarHierarchyData;
const { SidebarVariant } = window.SidebarHierarchyVariants;

function SidebarHierarchyApp() {
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState("superset-local");
  const [openProjectIds, setOpenProjectIds] = React.useState(["superset", "mini-krow", "temporary", "cdp-m5-import", "cdp-m5-empty"]);
  const [focusedVariantKey, setFocusedVariantKey] = React.useState("A");
  const [toastMessage, setToastMessage] = React.useState("");

  React.useEffect(() => {
    if (!toastMessage) return undefined;
    const toastTimeout = window.setTimeout(() => setToastMessage(""), 2200);
    return () => window.clearTimeout(toastTimeout);
  }, [toastMessage]);

  const toggleProject = (projectId) => setOpenProjectIds((previousIds) => previousIds.includes(projectId) ? previousIds.filter((itemId) => itemId !== projectId) : [...previousIds, projectId]);
  const selectWorkspace = (workspace) => { setActiveWorkspaceId(workspace.id); setToastMessage(`已切换到 ${workspace.title}`); };
  const addWorkspace = (projectTitle) => setToastMessage(`已为 ${projectTitle} 准备新建 workspace`);

  return <main className="comparison-page">
    <header className="comparison-header">
      <div>
        <p className="comparison-kicker">desktop sidebar / hierarchy study</p>
        <h1 className="comparison-title">项目与 workspace 的层级重构</h1>
        <p className="comparison-note">三种同尺寸侧栏方向，专注项目辨识与项目间呼吸感。</p>
      </div>
      <nav className="variant-tabs" aria-label="选择侧栏方案">
        {variantCards.map((variant) => <button key={variant.key} className={`variant-tab${focusedVariantKey === variant.key ? " active" : ""}`} type="button" aria-label={`查看方案 ${variant.key}`} onClick={() => setFocusedVariantKey(variant.key)}>{variant.key}</button>)}
      </nav>
    </header>
    <section className="variant-grid" aria-label="Sidebar hierarchy variants">
      {variantCards.map((variant) => <article key={variant.key} className={`variant-card${focusedVariantKey === variant.key ? " visible" : ""}`}>
        <div className="variant-meta">
          <span className="variant-letter">{variant.key}</span>
          <div><h2 className="variant-label">{variant.title}</h2><p className="variant-rationale">{variant.rationale}</p></div>
        </div>
        <div className="artboard-shell"><SidebarVariant variantKey={variant.key} activeWorkspaceId={activeWorkspaceId} openProjectIds={openProjectIds} onProjectToggle={toggleProject} onWorkspaceSelect={selectWorkspace} onProjectAdd={addWorkspace} /></div>
      </article>)}
    </section>
    {toastMessage ? <div className="toast-rail"><Toast tone="info">{toastMessage}</Toast></div> : null}
  </main>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<SidebarHierarchyApp />);
