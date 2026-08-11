const { Toast: QuietListV3Toast } = window.SupersetDesignSystem_91a6da;
const { QuietListV3: QuietListV3Sidebar } = window.SidebarQuietListV3;

function SidebarQuietListV3App() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState("superset-local");
  const [openProjectIds, setOpenProjectIds] = React.useState(["superset", "mini-krow", "temporary", "cdp-m5-import", "cdp-m5-empty"]);
  const [toastCopy, setToastCopy] = React.useState("");

  React.useEffect(() => {
    if (!toastCopy) return undefined;
    const quietListV3ToastTimer = window.setTimeout(() => setToastCopy(""), 2200);
    return () => window.clearTimeout(quietListV3ToastTimer);
  }, [toastCopy]);

  const toggleProject = (projectId) => setOpenProjectIds((priorProjectIds) => priorProjectIds.includes(projectId) ? priorProjectIds.filter((itemId) => itemId !== projectId) : [...priorProjectIds, projectId]);
  const selectWorkspace = (workspace) => { setSelectedWorkspaceId(workspace.id); setToastCopy(`已切换到 ${workspace.title}`); };
  const addWorkspace = (projectTitle) => setToastCopy(`已为 ${projectTitle} 准备新建 workspace`);
  const addRepository = () => setToastCopy("已打开 Add repository");

  return <main className="v3-page">
    <section className="v3-canvas" aria-label="Quiet List v3 refinement">
      <div className="v3-frame"><QuietListV3Sidebar selectedWorkspaceId={selectedWorkspaceId} openProjectIds={openProjectIds} onToggle={toggleProject} onSelect={selectWorkspace} onAdd={addWorkspace} onAddRepository={addRepository} /></div>
      <aside className="v3-notes" aria-label="设计说明"><p className="v3-kicker">direction A · refined</p><h1 className="v3-heading">Quiet List</h1><p className="v3-rationale">项目是清晰的文本锚点；workspace 只以 12px 缩进进入，不再借助卡片或树线解释关系。</p><ul className="v3-principles"><li className="v3-principle"><strong>Alignment</strong>项目与 workspace 共享干净左侧基线。</li><li className="v3-principle"><strong>Spacing</strong>32px 标题行与稳定的 16px 组距。</li><li className="v3-principle"><strong>Active state</strong>全宽 tint 与内嵌 accent bar，不压缩内容。</li></ul></aside>
    </section>
    {toastCopy ? <div className="v3-toast-rail"><QuietListV3Toast tone="info">{toastCopy}</QuietListV3Toast></div> : null}
  </main>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<SidebarQuietListV3App />);
