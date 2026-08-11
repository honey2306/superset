const { Icon: V2Icon } = window.SupersetDesignSystem_91a6da;
const { sidebarProjectData: v2Projects } = window.SidebarHierarchyData;

function V2WorkspaceRow({ workspace, selectedWorkspaceId, onSelect }) {
  const activeClass = selectedWorkspaceId === workspace.id ? " is-active" : "";
  return <button className={`v2-workspace${activeClass}`} type="button" onClick={() => onSelect(workspace)}>
    <span className="v2-workspace-name">{workspace.title}</span>
    <span className="v2-workspace-branch">{workspace.branch}</span>
  </button>;
}

function V2ProjectActions({ project, isOpen, onToggle, onAdd }) {
  return <span className="v2-project-actions">
    <button className="v2-icon-button" type="button" aria-label={`在 ${project.title} 新建 workspace`} title="新建 workspace" onClick={() => onAdd(project.title)}><V2Icon name="plus" size={13} /></button>
    <button className={`v2-project-toggle${isOpen ? "" : " is-closed"}`} type="button" aria-label={`${isOpen ? "收起" : "展开"} ${project.title}`} aria-expanded={isOpen} onClick={() => onToggle(project.id)}><V2Icon name="chevron" size={12} /></button>
  </span>;
}

function QuietList({ selectedWorkspaceId, openProjectIds, onToggle, onSelect, onAdd }) {
  return <div className="v2-body">
    {v2Projects.map((project) => {
      const projectIsOpen = openProjectIds.includes(project.id);
      return <section className="quiet-group" key={project.id}>
        <div className="quiet-project-line">
          <button className="v2-project-name" type="button" onClick={() => onToggle(project.id)}>{project.title}</button>
          <span className="v2-project-count">{project.workspaces.length}</span>
          <V2ProjectActions project={project} isOpen={projectIsOpen} onToggle={onToggle} onAdd={onAdd} />
        </div>
        {projectIsOpen ? <div className="quiet-workspaces">{project.workspaces.map((workspace) => <V2WorkspaceRow key={workspace.id} workspace={workspace} selectedWorkspaceId={selectedWorkspaceId} onSelect={onSelect} />)}</div> : null}
      </section>;
    })}
  </div>;
}

function FocusStack({ selectedWorkspaceId, focusedProjectId, onFocus, onSelect, onAdd }) {
  return <div className="v2-body">
    {v2Projects.map((project) => {
      const projectIsFocused = focusedProjectId === project.id;
      return <section className={`focus-group${projectIsFocused ? " is-focused" : ""}`} key={project.id}>
        <div className="focus-project-line">
          <button className="v2-project-name" type="button" onClick={() => onFocus(project.id)}>{project.title}</button>
          <span className="v2-project-count">{project.workspaces.length}</span>
          <V2ProjectActions project={project} isOpen={projectIsFocused} onToggle={onFocus} onAdd={onAdd} />
        </div>
        {projectIsFocused ? <div className="focus-workspaces">{project.workspaces.map((workspace) => <V2WorkspaceRow key={workspace.id} workspace={workspace} selectedWorkspaceId={selectedWorkspaceId} onSelect={onSelect} />)}</div> : null}
      </section>;
    })}
  </div>;
}

function SplitIndex({ selectedWorkspaceId, splitProjectId, onProjectSwitch, onSelect, onAdd }) {
  const selectedProject = v2Projects.find((project) => project.id === splitProjectId) || v2Projects[0];
  return <div className="split-shell">
    <nav className="split-index" aria-label="项目索引">
      <p className="split-index-label">Projects</p>
      {v2Projects.map((project) => <button key={project.id} className={`split-project${project.id === selectedProject.id ? " is-current" : ""}`} type="button" onClick={() => onProjectSwitch(project.id)}>
        <span className="split-project-text">{project.title}</span><span className="split-count">{project.workspaces.length}</span>
      </button>)}
    </nav>
    <section className="split-detail" aria-label={`${selectedProject.title} 的 workspaces`}>
      <div className="split-detail-head"><span className="split-detail-project">{selectedProject.title}</span><span className="split-detail-count">{selectedProject.workspaces.length}</span><button className="v2-icon-button" type="button" title="新建 workspace" aria-label={`在 ${selectedProject.title} 新建 workspace`} onClick={() => onAdd(selectedProject.title)}><V2Icon name="plus" size={13} /></button></div>
      <div className="split-workspaces">{selectedProject.workspaces.map((workspace) => <V2WorkspaceRow key={workspace.id} workspace={workspace} selectedWorkspaceId={selectedWorkspaceId} onSelect={onSelect} />)}</div>
    </section>
  </div>;
}

function V2Sidebar({ variantKey, selectedWorkspaceId, openProjectIds, focusedProjectId, splitProjectId, onToggle, onFocus, onProjectSwitch, onSelect, onAdd }) {
  let variantContent;
  if (variantKey === "A") variantContent = <QuietList selectedWorkspaceId={selectedWorkspaceId} openProjectIds={openProjectIds} onToggle={onToggle} onSelect={onSelect} onAdd={onAdd} />;
  if (variantKey === "B") variantContent = <FocusStack selectedWorkspaceId={selectedWorkspaceId} focusedProjectId={focusedProjectId} onFocus={onFocus} onSelect={onSelect} onAdd={onAdd} />;
  if (variantKey === "C") variantContent = <SplitIndex selectedWorkspaceId={selectedWorkspaceId} splitProjectId={splitProjectId} onProjectSwitch={onProjectSwitch} onSelect={onSelect} onAdd={onAdd} />;
  return <div className="v2-sidebar" data-screen-label={`Sidebar hierarchy v2 ${variantKey}`}>
    <div className="v2-topbar"><span className="v2-title">Workspaces</span><div className="v2-top-actions"><button className="v2-icon-button" type="button" aria-label="搜索 workspace" title="搜索 workspace"><V2Icon name="search" size={13} /></button><button className="v2-icon-button" type="button" aria-label="更多 workspace 操作" title="更多操作"><V2Icon name="moreH" size={13} /></button></div></div>
    {variantContent}
  </div>;
}

window.SidebarHierarchyV2Variants = { V2Sidebar };
