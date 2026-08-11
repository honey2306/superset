const { Icon } = window.SupersetDesignSystem_91a6da;
const { sidebarProjectData: hierarchyProjects } = window.SidebarHierarchyData;

function WorkspaceRow({ workspace, activeWorkspaceId, onWorkspaceSelect }) {
  const workspaceIsActive = activeWorkspaceId === workspace.id;
  return <button className={`workspace-row${workspaceIsActive ? " active" : ""}`} type="button" onClick={() => onWorkspaceSelect(workspace)}>
    <span className="workspace-name">{workspace.title}</span>
    <span className="workspace-branch">{workspace.branch}</span>
  </button>;
}

function ProjectHeader({ project, isProjectOpen, onProjectToggle, onProjectAdd }) {
  return <div className="project-header">
    <span className="project-heading">{project.title}</span>
    <span className="project-count">{project.workspaces.length}</span>
    <button className="icon-btn project-plus" type="button" aria-label={`在 ${project.title} 新建 workspace`} title="新建 workspace" onClick={() => onProjectAdd(project.title)}>
      <Icon name="plus" size={13} />
    </button>
    <button className={`project-chevron${isProjectOpen ? "" : " closed"}`} type="button" aria-label={`${isProjectOpen ? "收起" : "展开"} ${project.title}`} aria-expanded={isProjectOpen} onClick={() => onProjectToggle(project.id)}>
      <Icon name="chevron" size={12} />
    </button>
  </div>;
}

function VariantProject({ variantKey, project, openProjectIds, activeWorkspaceId, onProjectToggle, onWorkspaceSelect, onProjectAdd }) {
  const projectIsOpen = openProjectIds.includes(project.id);
  const outerClass = variantKey === "A" ? "panel-project" : variantKey === "B" ? "outline-project" : "chapter-project";
  const listClass = variantKey === "A" ? "panel-workspace-list" : variantKey === "B" ? "outline-rail" : "chapter-workspace-list";
  return <section className={outerClass}>
    <ProjectHeader project={project} isProjectOpen={projectIsOpen} onProjectToggle={onProjectToggle} onProjectAdd={onProjectAdd} />
    {projectIsOpen ? <div className={listClass}>{project.workspaces.map((workspace) => <WorkspaceRow key={workspace.id} workspace={workspace} activeWorkspaceId={activeWorkspaceId} onWorkspaceSelect={onWorkspaceSelect} />)}</div> : null}
  </section>;
}

function SidebarVariant({ variantKey, activeWorkspaceId, openProjectIds, onProjectToggle, onWorkspaceSelect, onProjectAdd }) {
  return <div className="sidebar-artboard" data-screen-label={`Sidebar hierarchy variant ${variantKey}`}>
    <div className="sidebar-topbar">
      <div className="sidebar-title"><span className="title-dot"></span>Workspaces</div>
      <div className="sidebar-actions">
        <button className="icon-btn" type="button" aria-label="搜索 workspace" title="搜索 workspace"><Icon name="search" size={13} /></button>
        <button className="icon-btn" type="button" aria-label="更多 workspace 操作" title="更多操作"><Icon name="moreH" size={13} /></button>
      </div>
    </div>
    <div className="sidebar-body">
      {hierarchyProjects.map((project) => <VariantProject key={project.id} variantKey={variantKey} project={project} openProjectIds={openProjectIds} activeWorkspaceId={activeWorkspaceId} onProjectToggle={onProjectToggle} onWorkspaceSelect={onWorkspaceSelect} onProjectAdd={onProjectAdd} />)}
    </div>
  </div>;
}

window.SidebarHierarchyVariants = { SidebarVariant };
