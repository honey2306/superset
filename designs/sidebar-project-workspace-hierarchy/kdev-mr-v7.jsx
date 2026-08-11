const { Icon: KDevMrV7Icon, Toast: KDevMrV7Toast, ContextMenu: KDevMrV7ContextMenu, MenuHeading: KDevMrV7MenuHeading, MenuSep: KDevMrV7MenuSep, MenuGroup: KDevMrV7MenuGroup, MenuItem: KDevMrV7MenuItem, Popover: KDevMrV7Popover, PopoverHeader: KDevMrV7PopoverHeader, PopoverGroup: KDevMrV7PopoverGroup, PopoverRow: KDevMrV7PopoverRow, PopoverSep: KDevMrV7PopoverSep, PopoverHint: KDevMrV7PopoverHint, Kbd: KDevMrV7Kbd } = window.SupersetDesignSystem_91a6da;

const kDevMrV7Projects = [
  {
    id: "agentx",
    title: "AgentX",
    workspaces: [
      {
        id: "agentx-web-local",
        title: "agentx_web",
        branch: "feat/explog-upload-flow",
        repository: { group: "AgentX", name: "agentx_web", repoId: "606972" }
      },
      {
        id: "agentx-web-review",
        title: "agentx_web review",
        branch: "fix/desktop-menu",
        repository: { group: "AgentX", name: "agentx_web", repoId: "606972" }
      }
    ]
  },
  {
    id: "superset",
    title: "superset",
    workspaces: [
      { id: "superset-local", title: "local", branch: "codex/terminal-fusion-smoke", repository: { group: "", name: "", repoId: "" } }
    ]
  }
];

const kDevMrV7Files = [
  { path: "apps/desktop/src/renderer/screens/main/WorkspaceSidebar.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/renderer/screens/main/ChatInterface.tsx", state: "M", tone: "mod" },
  { path: "apps/desktop/src/renderer/hooks/useWorkspace.ts", state: "A", tone: "add" },
  { path: "designs/sidebar-project-workspace-hierarchy/Sidebar KDev MR v7.html", state: "A", tone: "add" }
];

const kDevMrV7Branches = {
  local: ["feat/explog-upload-flow", "dev", "master", "fix/desktop-menu"],
  remote: ["origin/feat/explog-upload-flow", "origin/dev", "origin/master"]
};

function createKDevMrUrl(workspace) {
  const repository = workspace.repository;
  if (!repository || !repository.group || !repository.name || !repository.repoId) return null;
  return `https://kdev.corp.kuaishou.com/git/${repository.group}/${repository.name}/-/create_MR?branchName=${encodeURIComponent(workspace.branch)}`;
}

function KDevMrV7Project({ project, selectedWorkspaceId, branchFor, onSelect, onMenu }) {
  return <section className="v7-project"><div className="v7-project-head"><button className="v7-project-name" type="button">{project.title}</button><span className="v7-project-count">{project.workspaces.length}</span><button className="v7-icon-button" type="button" aria-label={`在 ${project.title} 新建 workspace`}><KDevMrV7Icon name="plus" size={13} /></button><button className="v7-icon-button" type="button" aria-label={`展开 ${project.title}`}><KDevMrV7Icon name="chevron" size={12} /></button></div>{project.workspaces.map((workspace) => <div className={`v7-workspace${workspace.id === selectedWorkspaceId ? " active" : ""}`} key={workspace.id}><button className="v7-workspace-copy" type="button" onClick={() => onSelect(workspace)}><span className="v7-workspace-title">{workspace.title}</span><span className="v7-workspace-branch">{branchFor(workspace)}</span></button><button className="v7-workspace-more" type="button" aria-label={`${branchFor(workspace)} 的 branch 操作`} onClick={(clickEvent) => onMenu(workspace, clickEvent.currentTarget)}><KDevMrV7Icon name="moreH" size={14} /></button></div>)}</section>;
}

function KDevMrV7Sidebar({ projects, selectedWorkspaceId, branchFor, onSelect, onMenu, onToast }) {
  return <aside className="v7-sidebar" aria-label="Projects and workspaces"><div className="v7-side-head"><span className="v7-side-title">Workspaces</span><span className="v7-icon-row"><button className="v7-icon-button" type="button" aria-label="Search workspaces" onClick={() => onToast("已打开 workspace 搜索")}><KDevMrV7Icon name="search" size={13} /></button><button className="v7-icon-button" type="button" aria-label="Workspace settings"><KDevMrV7Icon name="moreH" size={13} /></button></span></div><div className="v7-projects">{projects.map((project) => <KDevMrV7Project key={project.id} project={project} selectedWorkspaceId={selectedWorkspaceId} branchFor={branchFor} onSelect={onSelect} onMenu={onMenu} />)}</div><div className="v7-side-foot"><button className="v7-add" type="button" onClick={() => onToast("已打开 Add repository")}><KDevMrV7Icon name="plus" size={13} />Add repository</button><button className="v7-icon-button" type="button" aria-label="Settings"><KDevMrV7Icon name="moreH" size={13} /></button></div></aside>;
}

function KDevMrV7Changes({ activeTab, onTabChange, onToast }) {
  const shownFiles = activeTab === "Files" ? kDevMrV7Files.slice(0, 3) : kDevMrV7Files;
  return <aside className="v7-changes" aria-label="Changes panel"><div className="v7-change-tabs"><button className={`v7-change-tab${activeTab === "Changes" ? " active" : ""}`} type="button" onClick={() => onTabChange("Changes")}>Changes</button><button className={`v7-change-tab${activeTab === "Files" ? " active" : ""}`} type="button" onClick={() => onTabChange("Files")}>Files</button><span style={{ flex: 1 }}></span><button className="v7-icon-button" type="button" aria-label="Refresh changes" onClick={() => onToast("已刷新 changes")}><KDevMrV7Icon name="refresh" size={13} /></button></div><div className="v7-files">{shownFiles.map((file) => { const fileParts = file.path.split("/"); const fileName = fileParts.pop(); return <button key={file.path} type="button" className="v7-file" onClick={() => onToast(`已打开 ${fileName}`)}><KDevMrV7Icon name="file" size={12} /><span className="v7-file-path"><span>{fileParts.join("/")}/</span>{fileName}</span><span className={`v7-state ${file.tone}`}>{file.state}</span></button>; })}</div><div className="v7-commit"><input aria-label="Commit message" defaultValue="refactor(workspaces): keep branch picker in place" /><button type="button" onClick={() => onToast("已提交并推送更改")}>Commit &amp; Push</button></div></aside>;
}

function KDevMrV7Actions({ workspace, anchor, onPick, onChooseTarget, onAction }) {
  const menuTop = Math.min(anchor.top - 4, window.innerHeight - 446); const menuLeft = Math.min(anchor.right + 8, window.innerWidth - 282);
  const runAction = (copy) => () => onAction(copy); const kDevUrl = createKDevMrUrl(workspace);
  return <div className="v7-overlay" style={{ top: menuTop, left: menuLeft }} onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}><KDevMrV7ContextMenu><KDevMrV7MenuHeading title={workspace.branch} badge={<span className="tag">当前</span>} /><div className="v7-menu-note">workspace · {workspace.title}</div><KDevMrV7MenuSep /><KDevMrV7MenuGroup>常用</KDevMrV7MenuGroup><KDevMrV7MenuItem iconName="arrowRight" label="切换分支…" onClick={onPick} /><KDevMrV7MenuItem iconName="plus" label="从此分支新建 workspace…" onClick={runAction(`已从 ${workspace.branch} 新建 workspace`)} /><KDevMrV7MenuGroup>同步</KDevMrV7MenuGroup><KDevMrV7MenuItem iconName="refresh" label="Fetch" onClick={runAction("已 fetch origin")} /><KDevMrV7MenuItem iconName="pull" label="Pull" onClick={runAction("已拉取当前分支")} /><KDevMrV7MenuItem iconName="push" label="Push" onClick={runAction("已推送当前分支")} /><KDevMrV7MenuGroup>管理</KDevMrV7MenuGroup><KDevMrV7MenuItem iconName="copy" label="复制分支名" onClick={runAction(`已复制 · ${workspace.branch}`)} /><KDevMrV7MenuItem iconName="edit" label="重命名分支…" onClick={runAction("已打开重命名分支")} /><KDevMrV7MenuItem iconName="merge" label="在 KDev 提 MR" onClick={() => onChooseTarget(kDevUrl, workspace)} disabled={!kDevUrl} title={!kDevUrl ? "缺少 KDev 仓库信息" : "选择目标分支后打开 KDev"} /><KDevMrV7MenuSep /><KDevMrV7MenuItem iconName="trash" label="删除分支" danger disabled title="不能删除当前分支" /></KDevMrV7ContextMenu></div>;
}

function KDevMrV7TargetPicker({ workspace, anchor, onBack, onChooseTarget, onChooseIndependently }) {
  const menuTop = Math.min(anchor.top - 4, window.innerHeight - 252); const menuLeft = Math.min(anchor.right + 8, window.innerWidth - 282);
  return <div className="v7-overlay" style={{ top: menuTop, left: menuLeft }} onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}><KDevMrV7Popover><div className="v7-picker-head"><button className="v7-picker-back" type="button" aria-label="返回 branch 操作" onClick={onBack}><KDevMrV7Icon name="arrowRight" size={13} style={{ transform: "rotate(180deg)" }} /></button><span>选择目标分支</span></div><div className="v7-menu-note">源分支 · {workspace.branch}</div><div className="v7-target-choice-list"><button className="v7-target-choice" type="button" onClick={() => onChooseTarget("dev")}><KDevMrV7Icon name="branch" size={13} /><span>dev</span><small>目标分支</small></button><button className="v7-target-choice" type="button" onClick={() => onChooseTarget("master")}><KDevMrV7Icon name="branch" size={13} /><span>master</span><small>目标分支</small></button></div><KDevMrV7PopoverSep /><button className="v7-target-choice independent" type="button" onClick={onChooseIndependently}><KDevMrV7Icon name="search" size={13} /><span>自主选择…</span><small>在 KDev 确认</small></button><KDevMrV7PopoverHint><KDevMrV7Kbd>Esc</KDevMrV7Kbd>关闭</KDevMrV7PopoverHint></KDevMrV7Popover></div>;
}

function KDevMrV7Picker({ workspace, anchor, onBack, onChoose }) {
  const [query, setQuery] = React.useState(""); const pickerInputRef = React.useRef(null);
  React.useEffect(() => { window.setTimeout(() => pickerInputRef.current && pickerInputRef.current.focus(), 0); }, []);
  const matchBranch = (branchName) => branchName.toLowerCase().includes(query.trim().toLowerCase()); const localBranches = [...new Set([workspace.branch, ...kDevMrV7Branches.local])].filter(matchBranch); const remoteBranches = kDevMrV7Branches.remote.filter(matchBranch);
  const menuTop = Math.min(anchor.top - 4, window.innerHeight - 446); const menuLeft = Math.min(anchor.right + 8, window.innerWidth - 282); const firstResult = localBranches[0] || remoteBranches[0]; const chooseFirstResult = (keyboardEvent) => { if (keyboardEvent.key !== "Enter" || !firstResult) return; keyboardEvent.preventDefault(); onChoose(firstResult.replace("origin/", "")); };
  return <div className="v7-overlay" style={{ top: menuTop, left: menuLeft }} onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()} onKeyDown={chooseFirstResult}><KDevMrV7Popover><div className="v7-picker-head"><button className="v7-picker-back" type="button" aria-label="返回 branch 操作" onClick={onBack}><KDevMrV7Icon name="arrowRight" size={13} style={{ transform: "rotate(180deg)" }} /></button><span>切换分支</span></div><KDevMrV7PopoverHeader placeholder="搜索 branch…" value={query} onChange={setQuery} inputRef={pickerInputRef} trailing={<KDevMrV7Kbd>⌘K</KDevMrV7Kbd>} /><div className="v7-picker-list"><KDevMrV7PopoverGroup label="本地分支" count={localBranches.length} />{localBranches.map((branchName) => <KDevMrV7PopoverRow key={branchName} name={branchName} current={branchName === workspace.branch} focused={branchName === firstResult} tag={branchName === workspace.branch ? <span className="v7-current-tag">当前</span> : null} end={branchName === "main" ? "↓ 2" : branchName === "feat/kro-suite" ? "↑ 3" : null} onClick={() => onChoose(branchName)} />)}<KDevMrV7PopoverSep /><KDevMrV7PopoverGroup label="远程分支" count={remoteBranches.length} />{remoteBranches.map((branchName) => <KDevMrV7PopoverRow key={branchName} iconName="cloud" name={branchName} focused={!localBranches.length && branchName === firstResult} end="origin" onClick={() => onChoose(branchName.replace("origin/", ""))} />)}{!localBranches.length && !remoteBranches.length ? <div className="v7-menu-note">没有匹配的 branch</div> : null}</div><KDevMrV7PopoverHint><KDevMrV7Kbd>Esc</KDevMrV7Kbd>关闭 <span style={{ marginLeft: "auto" }}><KDevMrV7Kbd>Enter</KDevMrV7Kbd>切换</span></KDevMrV7PopoverHint></KDevMrV7Popover></div>;
}

window.KDevMrV7Parts = { KDevMrV7Icon, KDevMrV7Toast, KDevMrV7Sidebar, KDevMrV7Changes, KDevMrV7Actions, KDevMrV7Picker, KDevMrV7TargetPicker, createKDevMrUrl, kDevMrV7Projects };
