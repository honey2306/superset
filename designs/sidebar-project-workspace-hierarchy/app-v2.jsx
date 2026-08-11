const { Toast: V2Toast } = window.SupersetDesignSystem_91a6da;
const { V2Sidebar: V2SidebarComponent } = window.SidebarHierarchyV2Variants;

const v2VariantCards = [
  { key: "A", title: "极简清单", rationale: "最稳妥：项目是清晰锚点，workspace 用细导轨与当前态回答层级。" },
  { key: "B", title: "焦点项目", rationale: "把正在工作的项目提为焦点，其余项目退成宽松的章节索引。" },
  { key: "C", title: "双栏索引", rationale: "项目索引与 workspace 详情分列，快速跨项目浏览，不牺牲密度。" }
];

function SidebarHierarchyV2App() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState("superset-local");
  const [openProjectIds, setOpenProjectIds] = React.useState(["superset", "mini-krow", "temporary", "cdp-m5-import", "cdp-m5-empty"]);
  const [focusedProjectId, setFocusedProjectId] = React.useState("superset");
  const [splitProjectId, setSplitProjectId] = React.useState("superset");
  const [visibleVariantKey, setVisibleVariantKey] = React.useState("A");
  const [toastCopy, setToastCopy] = React.useState("");

  React.useEffect(() => {
    if (!toastCopy) return undefined;
    const toastTimer = window.setTimeout(() => setToastCopy(""), 2200);
    return () => window.clearTimeout(toastTimer);
  }, [toastCopy]);

  const toggleProject = (projectId) => setOpenProjectIds((priorProjectIds) => priorProjectIds.includes(projectId) ? priorProjectIds.filter((itemId) => itemId !== projectId) : [...priorProjectIds, projectId]);
  const selectWorkspace = (workspace) => { setSelectedWorkspaceId(workspace.id); setToastCopy(`已切换到 ${workspace.title}`); };
  const focusProject = (projectId) => setFocusedProjectId((currentProjectId) => currentProjectId === projectId ? "" : projectId);
  const switchProject = (projectId) => setSplitProjectId(projectId);
  const addWorkspace = (projectTitle) => setToastCopy(`已为 ${projectTitle} 准备新建 workspace`);

  return <main className="v2-page">
    <header className="v2-header"><div><p className="v2-eyebrow">desktop sidebar · hierarchy directions</p><h1 className="v2-heading">项目与 workspace 的层级重构</h1><p className="v2-subtitle">336px 生产级侧栏探索：更深的层级感，更干净的项目节奏。</p></div><nav className="v2-tabs" aria-label="选择方案">{v2VariantCards.map((variant) => <button key={variant.key} className={`v2-tab${visibleVariantKey === variant.key ? " active" : ""}`} type="button" onClick={() => setVisibleVariantKey(variant.key)}>{variant.key}</button>)}</nav></header>
    <section className="v2-grid" aria-label="Sidebar hierarchy v2 variants">{v2VariantCards.map((variant) => <article className={`v2-card${visibleVariantKey === variant.key ? " is-visible" : ""}`} key={variant.key}><div className="v2-meta"><span className="v2-letter">{variant.key}</span><div><h2 className="v2-label">{variant.title}</h2><p className="v2-rationale">{variant.rationale}</p></div></div><div className="v2-frame"><V2SidebarComponent variantKey={variant.key} selectedWorkspaceId={selectedWorkspaceId} openProjectIds={openProjectIds} focusedProjectId={focusedProjectId} splitProjectId={splitProjectId} onToggle={toggleProject} onFocus={focusProject} onProjectSwitch={switchProject} onSelect={selectWorkspace} onAdd={addWorkspace} /></div></article>)}</section>
    {toastCopy ? <div className="v2-toast-rail"><V2Toast tone="info">{toastCopy}</V2Toast></div> : null}
  </main>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<SidebarHierarchyV2App />);
