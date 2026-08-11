const { Icon: FullAppV4Icon, Toast: FullAppV4Toast } = window.SupersetDesignSystem_91a6da;
const { sidebarProjectData: fullAppV4Projects } = window.SidebarHierarchyData;

const fullAppV4Files = [
  { path: "apps/desktop/src/renderer/screens/main/WorkspaceSidebar.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/renderer/screens/main/ChatInterface.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/renderer/hooks/useWorkspace.ts", state: "A", tone: "add" },
  { path: "packages/ui/src/components/ui/tabs.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/main/host-service.ts", state: "M", tone: "mod" },
  { path: "designs/sidebar-project-workspace-hierarchy/Sidebar Full App v4.html", state: "A", tone: "add" }
];

function FullAppV4Project({ project, isOpen, selectedWorkspaceId, onToggle, onSelect, onAdd }) {
  return <section className="v4-project-group">
    <div className="v4-project-header">
      <button className="v4-project-title" type="button" onClick={() => onToggle(project.id)}>{project.title}</button>
      <span className="v4-project-count">{project.workspaces.length}</span>
      <span className="v4-workspace-actions">
        <button className="v4-project-action" type="button" aria-label={`在 ${project.title} 新建 workspace`} onClick={() => onAdd(project.title)}><FullAppV4Icon name="plus" size={13} /></button>
        <button className={`v4-project-action${isOpen ? "" : " is-collapsed"}`} type="button" aria-label={`${isOpen ? "收起" : "展开"} ${project.title}`} aria-expanded={isOpen} onClick={() => onToggle(project.id)}><FullAppV4Icon name="chevron" size={12} /></button>
      </span>
    </div>
    {isOpen ? <div className="v4-workspace-list">{project.workspaces.map((workspace) => <button key={workspace.id} className={`v4-workspace${workspace.id === selectedWorkspaceId ? " is-active" : ""}`} type="button" onClick={() => onSelect(workspace)}><span className="v4-workspace-title">{workspace.title}</span><span className="v4-workspace-branch">{workspace.branch}</span></button>)}</div> : null}
  </section>;
}

function FullAppV4Sidebar({ selectedWorkspaceId, openProjectIds, onToggle, onSelect, onToast }) {
  return <aside className="v4-sidebar" aria-label="Projects and workspaces">
    <div className="v4-sidebar-head"><span className="v4-sidebar-name">Workspaces</span><span className="v4-workspace-actions"><button className="v4-icon-button" type="button" aria-label="Search workspaces" onClick={() => onToast("已打开 workspace 搜索")}><FullAppV4Icon name="search" size={13} /></button><button className="v4-icon-button" type="button" aria-label="Workspace menu"><FullAppV4Icon name="moreH" size={13} /></button></span></div>
    <div className="v4-project-list">{fullAppV4Projects.map((project) => <FullAppV4Project key={project.id} project={project} isOpen={openProjectIds.includes(project.id)} selectedWorkspaceId={selectedWorkspaceId} onToggle={onToggle} onSelect={onSelect} onAdd={(projectTitle) => onToast(`已为 ${projectTitle} 准备新建 workspace`)} />)}</div>
    <div className="v4-sidebar-foot"><button className="v4-add-repo" type="button" onClick={() => onToast("已打开 Add repository")}><FullAppV4Icon name="plus" size={13} />Add repository</button><button className="v4-icon-button" type="button" aria-label="Settings"><FullAppV4Icon name="moreH" size={13} /></button></div>
  </aside>;
}

function FullAppV4Changes({ selectedWorkspace, activeTab, onTabChange, onToast }) {
  const showFiles = activeTab === "Files";
  return <aside className="v4-changes" aria-label="Changes panel">
    <div className="v4-change-tabs"><button className={`v4-change-tab${!showFiles ? " is-active" : ""}`} type="button" onClick={() => onTabChange("Changes")}>Changes</button><button className={`v4-change-tab${showFiles ? " is-active" : ""}`} type="button" onClick={() => onTabChange("Files")}>Files</button><span style={{ flex: 1 }}></span><button className="v4-icon-button" type="button" aria-label="Refresh changes" onClick={() => onToast("已刷新 changes")}><FullAppV4Icon name="refresh" size={13} /></button></div>
    <div className="v4-branch-bar"><FullAppV4Icon name="branch" size={12} /><span className="v4-branch-name">{selectedWorkspace.branch}</span><span style={{ flex: 1 }}></span><button className="v4-icon-button" type="button" aria-label="Sort files"><FullAppV4Icon name="sort" size={12} /></button></div>
    <div className="v4-files">{(showFiles ? fullAppV4Files.slice(0, 4) : fullAppV4Files).map((file) => { const parts = file.path.split("/"); const name = parts.pop(); return <button key={file.path} type="button" className="v4-file" onClick={() => onToast(`已打开 ${name}`)}><FullAppV4Icon name="file" size={12} /><span className="v4-file-path"><span>{parts.join("/")}/</span>{name}</span><span className={`v4-file-status ${file.tone}`}>{file.state}</span></button>; })}</div>
    {!showFiles ? <div className="v4-commit"><input aria-label="Commit message" defaultValue="refactor(workspaces): clarify project hierarchy" /><button type="button" onClick={() => onToast("已提交 6 个文件")}>Commit &amp; Push</button></div> : <div className="v4-commit"><button type="button" onClick={() => onToast("已在 Finder 中显示 workspace")}>Open workspace</button></div>}
  </aside>;
}

window.FullAppV4Parts = { FullAppV4Icon, FullAppV4Toast, FullAppV4Sidebar, FullAppV4Changes };
