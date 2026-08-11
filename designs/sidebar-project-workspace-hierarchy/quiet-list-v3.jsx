const { Icon: QuietListV3Icon } = window.SupersetDesignSystem_91a6da;
const { sidebarProjectData: quietListV3Projects } = window.SidebarHierarchyData;

function QuietListV3WorkspaceRow({ workspace, selectedWorkspaceId, onSelect }) {
  const activeClass = selectedWorkspaceId === workspace.id ? " is-active" : "";
  return <button className={`v3-workspace${activeClass}`} type="button" onClick={() => onSelect(workspace)}>
    <span className="v3-workspace-title">{workspace.title}</span>
    <span className="v3-workspace-branch">{workspace.branch}</span>
  </button>;
}

function QuietListV3ProjectActions({ project, isOpen, onToggle, onAdd }) {
  return <span className="v3-project-actions">
    <button className="v3-project-action" type="button" aria-label={`在 ${project.title} 新建 workspace`} title="新建 workspace" onClick={(event) => { event.stopPropagation(); onAdd(project.title); }}><QuietListV3Icon name="plus" size={13} /></button>
    <button className={`v3-project-action${isOpen ? "" : " is-collapsed"}`} type="button" aria-label={`${isOpen ? "收起" : "展开"} ${project.title}`} aria-expanded={isOpen} onClick={(event) => { event.stopPropagation(); onToggle(project.id); }}><QuietListV3Icon name="chevron" size={12} /></button>
  </span>;
}

function QuietListV3({ selectedWorkspaceId, openProjectIds, onToggle, onSelect, onAdd, onAddRepository }) {
  return <div className="v3-sidebar" data-screen-label="Sidebar quiet list v3">
    <header className="v3-topbar"><span className="v3-topbar-title">Workspaces</span><div className="v3-top-actions"><button className="v3-icon-button" type="button" aria-label="搜索 workspace" title="搜索 workspace"><QuietListV3Icon name="search" size={13} /></button><button className="v3-icon-button" type="button" aria-label="更多 workspace 操作" title="更多操作"><QuietListV3Icon name="moreH" size={13} /></button></div></header>
    <div className="v3-list">
      {quietListV3Projects.map((project) => {
        const projectIsOpen = openProjectIds.includes(project.id);
        return <section className="v3-project-group" key={project.id}>
          <div className="v3-project-header">
            <button className="v3-project-title" type="button" onClick={() => onToggle(project.id)}>{project.title}</button>
            <span className="v3-project-count">{project.workspaces.length}</span>
            <QuietListV3ProjectActions project={project} isOpen={projectIsOpen} onToggle={onToggle} onAdd={onAdd} />
          </div>
          {projectIsOpen ? <div className="v3-workspace-list">{project.workspaces.map((workspace) => <QuietListV3WorkspaceRow key={workspace.id} workspace={workspace} selectedWorkspaceId={selectedWorkspaceId} onSelect={onSelect} />)}</div> : null}
        </section>;
      })}
    </div>
    <footer className="v3-footer"><button className="v3-footer-action" type="button" onClick={onAddRepository}><QuietListV3Icon name="plus" size={13} />Add repository</button></footer>
  </div>;
}

window.SidebarQuietListV3 = { QuietListV3 };
