const { Icon: BranchActionsV5Icon, Toast: BranchActionsV5Toast, ContextMenu: BranchActionsV5ContextMenu, MenuHeading: BranchActionsV5MenuHeading, MenuSep: BranchActionsV5MenuSep, MenuGroup: BranchActionsV5MenuGroup, MenuItem: BranchActionsV5MenuItem } = window.SupersetDesignSystem_91a6da;
const { sidebarProjectData: branchActionsV5Projects } = window.SidebarHierarchyData;

const branchActionsV5Files = [
  { path: "apps/desktop/src/renderer/screens/main/WorkspaceSidebar.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/renderer/screens/main/ChatInterface.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/renderer/hooks/useWorkspace.ts", state: "A", tone: "add" },
  { path: "packages/ui/src/components/ui/tabs.tsx", state: "M", tone: "mod" },
  { path: "designs/sidebar-project-workspace-hierarchy/Sidebar Branch Actions v5.html", state: "A", tone: "add" }
];

function BranchActionsV5Project({ project, isOpen, selectedWorkspaceId, onToggle, onSelect, onMenu, onToast }) {
  return <section className="v5-project">
    <div className="v5-project-header">
      <button className="v5-project-name" type="button" onClick={() => onToggle(project.id)}>{project.title}</button>
      <span className="v5-project-count">{project.workspaces.length}</span>
      <span className="v5-project-tools">
        <button className="v5-project-tool" type="button" aria-label={`在 ${project.title} 新建 workspace`} onClick={() => onToast(`已为 ${project.title} 准备新建 workspace`)}><BranchActionsV5Icon name="plus" size={13} /></button>
        <button className={`v5-project-tool${isOpen ? "" : " is-closed"}`} type="button" aria-label={`${isOpen ? "收起" : "展开"} ${project.title}`} aria-expanded={isOpen} onClick={() => onToggle(project.id)}><BranchActionsV5Icon name="chevron" size={12} /></button>
      </span>
    </div>
    {isOpen ? <div className="v5-workspace-list">{project.workspaces.map((workspace) => <div key={workspace.id} className={`v5-workspace${workspace.id === selectedWorkspaceId ? " is-active" : ""}`}><button className="v5-workspace-copy" type="button" onClick={() => onSelect(workspace)}><span className="v5-workspace-title">{workspace.title}</span><span className="v5-workspace-branch">{workspace.branch}</span></button><button className="v5-workspace-more" type="button" aria-label={`${workspace.branch} 的 branch 操作`} onClick={(event) => onMenu(workspace, event.currentTarget)}><BranchActionsV5Icon name="moreH" size={14} /></button></div>)}</div> : null}
  </section>;
}

function BranchActionsV5Sidebar({ selectedWorkspaceId, openProjectIds, onToggle, onSelect, onMenu, onToast }) {
  return <aside className="v5-sidebar" aria-label="Projects and workspaces"><div className="v5-sidebar-head"><span className="v5-sidebar-title">Workspaces</span><span className="v5-icon-row"><button className="v5-icon-button" type="button" aria-label="Search workspaces" onClick={() => onToast("已打开 workspace 搜索")}><BranchActionsV5Icon name="search" size={13} /></button><button className="v5-icon-button" type="button" aria-label="Workspace menu"><BranchActionsV5Icon name="moreH" size={13} /></button></span></div><div className="v5-project-list">{branchActionsV5Projects.map((project) => <BranchActionsV5Project key={project.id} project={project} isOpen={openProjectIds.includes(project.id)} selectedWorkspaceId={selectedWorkspaceId} onToggle={onToggle} onSelect={onSelect} onMenu={onMenu} onToast={onToast} />)}</div><div className="v5-sidebar-foot"><button className="v5-add-repo" type="button" onClick={() => onToast("已打开 Add repository")}><BranchActionsV5Icon name="plus" size={13} />Add repository</button><button className="v5-icon-button" type="button" aria-label="Settings"><BranchActionsV5Icon name="moreH" size={13} /></button></div></aside>;
}

function BranchActionsV5Changes({ activeTab, onTabChange, onToast }) {
  const branchActionsV5ShowFiles = activeTab === "Files";
  const shownFiles = branchActionsV5ShowFiles ? branchActionsV5Files.slice(0, 3) : branchActionsV5Files;
  return <aside className="v5-changes" aria-label="Changes panel"><div className="v5-change-tabs"><button className={`v5-change-tab${branchActionsV5ShowFiles ? "" : " is-active"}`} type="button" onClick={() => onTabChange("Changes")}>Changes</button><button className={`v5-change-tab${branchActionsV5ShowFiles ? " is-active" : ""}`} type="button" onClick={() => onTabChange("Files")}>Files</button><span style={{ flex: 1 }}></span><button className="v5-icon-button" type="button" aria-label="Refresh changes" onClick={() => onToast("已刷新 changes")}><BranchActionsV5Icon name="refresh" size={13} /></button></div><div className="v5-files">{shownFiles.map((file) => { const parts = file.path.split("/"); const fileName = parts.pop(); return <button key={file.path} type="button" className="v5-file" onClick={() => onToast(`已打开 ${fileName}`)}><BranchActionsV5Icon name="file" size={12} /><span className="v5-file-path"><span>{parts.join("/")}/</span>{fileName}</span><span className={`v5-file-status ${file.tone}`}>{file.state}</span></button>; })}</div><div className="v5-commit"><input aria-label="Commit message" defaultValue="refactor(workspaces): move branch actions to workspace" />{branchActionsV5ShowFiles ? <button type="button" onClick={() => onToast("已在 Finder 中显示 workspace")}>Open workspace</button> : <button type="button" onClick={() => onToast("已提交并推送更改")}>Commit &amp; Push</button>}</div></aside>;
}

function BranchActionsV5Menu({ workspace, anchor, onClose, onAction }) {
  if (!workspace || !anchor) return null;
  const menuTop = Math.min(anchor.top - 4, window.innerHeight - 446);
  const menuLeft = Math.min(anchor.right + 8, window.innerWidth - 282);
  const action = (copy) => () => onAction(copy);
  return <div className="v5-workspace-menu" style={{ top: menuTop, left: menuLeft }} onMouseDown={(event) => event.stopPropagation()}><BranchActionsV5ContextMenu><BranchActionsV5MenuHeading title={workspace.branch} badge={<span className="tag">当前</span>} /><div className="v5-menu-note">workspace · {workspace.title}</div><BranchActionsV5MenuSep /><BranchActionsV5MenuGroup>常用</BranchActionsV5MenuGroup><BranchActionsV5MenuItem iconName="arrowRight" label="切换分支…" onClick={action("已打开分支切换")} /><BranchActionsV5MenuItem iconName="plus" label="从此分支新建 workspace…" onClick={action(`已从 ${workspace.branch} 新建 workspace`)} /><BranchActionsV5MenuGroup>同步</BranchActionsV5MenuGroup><BranchActionsV5MenuItem iconName="refresh" label="Fetch" onClick={action("已 fetch origin")} /><BranchActionsV5MenuItem iconName="pull" label="Pull" onClick={action("已拉取当前分支")} /><BranchActionsV5MenuItem iconName="push" label="Push" onClick={action("已推送当前分支")} /><BranchActionsV5MenuGroup>管理</BranchActionsV5MenuGroup><BranchActionsV5MenuItem iconName="copy" label="复制分支名" onClick={action(`已复制 · ${workspace.branch}`)} /><BranchActionsV5MenuItem iconName="edit" label="重命名分支…" onClick={action("已打开重命名分支")} /><BranchActionsV5MenuItem iconName="branch" label="打开 Pull Request" onClick={action("已打开 Pull Request")} /><BranchActionsV5MenuSep /><BranchActionsV5MenuItem iconName="trash" label="删除分支" danger disabled title="不能删除当前分支" /><div className="v5-menu-note">当前分支无法删除</div></BranchActionsV5ContextMenu></div>;
}

window.BranchActionsV5Parts = { BranchActionsV5Icon, BranchActionsV5Toast, BranchActionsV5Sidebar, BranchActionsV5Changes, BranchActionsV5Menu };
