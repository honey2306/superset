const {
  Button,
  ContextMenu,
  Dialog,
  DialogFooter,
  DialogHeader,
  Icon,
  IconButton,
  Kbd,
  MenuGroup,
  MenuHeading,
  MenuItem,
  MenuSep,
  Toast,
} = window.SupersetDesignSystem_91a6da;

const initialCategories = [
  {
    id: "superset",
    name: "Superset 产品",
    color: "var(--accent)",
    projects: [
      {
        id: "desktop",
        name: "Superset Desktop",
        repositories: [
          {
            id: "desktop-app",
            name: "superset",
            role: "主仓库",
            workspaces: [
              { id: "sidebar", name: "feat/project-groups", state: "running", meta: "3m" },
              { id: "main", name: "main", state: "ok", meta: "1h" },
            ],
          },
          {
            id: "desktop-site",
            name: "superset-site",
            role: "官网",
            workspaces: [{ id: "launch", name: "feat/launch-page", state: "idle", meta: "2d" }],
          },
          {
            id: "docs",
            name: "superset-docs",
            role: "文档",
            workspaces: [{ id: "guide", name: "docs/multi-repo", state: "ok", meta: "4d" }],
          },
        ],
      },
      {
        id: "cloud",
        name: "Superset Cloud",
        repositories: [
          {
            id: "api",
            name: "superset-api",
            role: "服务端",
            workspaces: [{ id: "billing", name: "fix/billing-sync", state: "ok", meta: "1d" }],
          },
          {
            id: "infra",
            name: "superset-infra",
            role: "基础设施",
            workspaces: [{ id: "deploy", name: "chore/deploy", state: "idle", meta: "5d" }],
          },
        ],
      },
    ],
  },
  {
    id: "internal",
    name: "内部工具",
    color: "var(--accent-2)",
    projects: [
      {
        id: "admin",
        name: "运营后台",
        repositories: [
          {
            id: "admin-web",
            name: "admin-web",
            role: "前端",
            workspaces: [{ id: "audit", name: "feat/audit-log", state: "idle", meta: "6h" }],
          },
          {
            id: "admin-api",
            name: "admin-api",
            role: "接口",
            workspaces: [{ id: "permissions", name: "fix/permissions", state: "ok", meta: "2d" }],
          },
        ],
      },
    ],
  },
  {
    id: "experiments",
    name: "实验项目",
    color: "var(--info)",
    projects: [
      {
        id: "mobile",
        name: "Mobile 实验",
        repositories: [
          {
            id: "mobile-ios",
            name: "superset-mobile",
            role: "iOS",
            workspaces: [{ id: "voice", name: "feat/voice-input", state: "idle", meta: "1w" }],
          },
        ],
      },
    ],
  },
];

const variantOptions = [
  { id: "tree", label: "A · 紧凑树形" },
  { id: "cards", label: "B · 仓库卡片" },
  { id: "focus", label: "C · 产品聚焦" },
];

function countWorkspaces(category) {
  return category.projects.reduce(
    (projectTotal, project) =>
      projectTotal + project.repositories.reduce((repoTotal, repo) => repoTotal + repo.workspaces.length, 0),
    0,
  );
}

function WorkspaceRows({ workspaces, selectedWorkspace, onSelect }) {
  return (
    <div className="workspaces">
      {workspaces.map((workspace) => (
        <button
          className={`workspace-row ${selectedWorkspace === workspace.id ? "active" : ""}`}
          key={workspace.id}
          onClick={() => onSelect(workspace.id)}
          type="button"
        >
          <span className={`state-dot ${workspace.state}`}></span>
          <span className="workspace-name">{workspace.name}</span>
          <span className="workspace-meta">{workspace.meta}</span>
        </button>
      ))}
    </div>
  );
}

function RepositoryBlock({ repo, variant, repoOpen, onToggleRepo, selectedWorkspace, onSelect }) {
  const cardClass = variant === "cards" ? "repo-card" : "repo";
  return (
    <div className={cardClass}>
      <div className="repo-head" onClick={() => onToggleRepo(repo.id)} role="button" tabIndex="0">
        <span className={`chevron-btn ${repoOpen ? "" : "closed"}`}><Icon name="chevron" size={11} /></span>
        <Icon name="file" size={13} />
        <span className="repo-name">{repo.name}</span>
        <span className="repo-role">{repo.role}</span>
        <span className="count">{repo.workspaces.length}</span>
      </div>
      {repoOpen && (
        <WorkspaceRows workspaces={repo.workspaces} selectedWorkspace={selectedWorkspace} onSelect={onSelect} />
      )}
    </div>
  );
}

function ProjectBlock({ project, variant, collapsedProjects, toggleProject, openRepos, toggleRepo, selectedWorkspace, onSelect, onDragStart, onDragEnd }) {
  const projectOpen = !collapsedProjects.has(project.id);
  const repoCount = project.repositories.length;
  return (
    <div className="project" draggable onDragStart={(event) => onDragStart(event, project.id)} onDragEnd={onDragEnd}>
      <div className="project-head" onClick={() => toggleProject(project.id)} role="button" tabIndex="0">
        <span className={`chevron-btn ${projectOpen ? "" : "closed"}`}><Icon name="chevron" size={11} /></span>
        <span className="project-icon"><Icon name="branch" size={13} /></span>
        <span className="project-name">{project.name}</span>
        <span className="count">{repoCount} repos</span>
      </div>
      {projectOpen && variant === "cards" && (
        <div className="project-summary">{countWorkspaces({ projects: [project] })} 个 Workspace · 按仓库分区</div>
      )}
      {projectOpen && (
        <div className={variant === "cards" ? "" : "repo-list"}>
          {project.repositories.map((repo) => (
            <RepositoryBlock
              key={repo.id}
              repo={repo}
              variant={variant}
              repoOpen={openRepos.has(repo.id)}
              onToggleRepo={toggleRepo}
              selectedWorkspace={selectedWorkspace}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryMenu({ category, onClose, onAddCategory, onRename, onDelete }) {
  return (
    <div className="floating-menu" onClick={(event) => event.stopPropagation()}>
      <ContextMenu>
        <MenuHeading title={category.name} badge={`${category.projects.length} projects`} />
        <MenuSep />
        <MenuGroup>分类管理</MenuGroup>
        <MenuItem iconName="plus" label="添加项目…" onClick={() => { onClose(); onAddCategory("project"); }} />
        <MenuItem iconName="edit" label="重命名分类…" onClick={() => { onClose(); onRename(category.id); }} />
        <MenuItem iconName="copy" label="复制分类链接" onClick={onClose} />
        <MenuSep />
        <MenuItem iconName="trash" label="删除分类" danger disabled={category.projects.length > 0} title="分类非空时不可删除" onClick={() => onDelete(category.id)} />
      </ContextMenu>
    </div>
  );
}

function CategoryBlock(props) {
  const {
    category,
    variant,
    collapsedCategories,
    toggleCategory,
    collapsedProjects,
    toggleProject,
    openRepos,
    toggleRepo,
    selectedWorkspace,
    onSelect,
    menuCategory,
    setMenuCategory,
    onAddCategory,
    onRename,
    onDelete,
    draggingProject,
    onDragStart,
    onDragEnd,
    onDropProject,
  } = props;
  const categoryOpen = !collapsedCategories.has(category.id);
  const dragOver = draggingProject && draggingProject.overCategory === category.id;

  return (
    <div
      className={`category ${dragOver ? "drag-over" : ""}`}
      style={{ "--category-color": category.color }}
      onDragOver={(event) => { event.preventDefault(); draggingProject?.setOver(category.id); }}
      onDragLeave={() => draggingProject?.setOver(null)}
      onDrop={(event) => { event.preventDefault(); onDropProject(category.id); }}
    >
      <div className="category-head">
        <button className={`chevron-btn ${categoryOpen ? "" : "closed"}`} onClick={() => toggleCategory(category.id)} type="button"><Icon name="chevron" size={11} /></button>
        <span className="category-dot"></span>
        <span className="category-name">{category.name}</span>
        <span className="count">{category.projects.length} · {countWorkspaces(category)}</span>
        <span className="menu-anchor">
          <button className={`more-btn ${menuCategory === category.id ? "open" : ""}`} onClick={() => setMenuCategory(menuCategory === category.id ? null : category.id)} type="button"><Icon name="moreH" size={14} /></button>
          {menuCategory === category.id && (
            <CategoryMenu category={category} onClose={() => setMenuCategory(null)} onAddCategory={onAddCategory} onRename={onRename} onDelete={onDelete} />
          )}
        </span>
      </div>
      {dragOver && <div className="drop-hint">移动项目到「{category.name}」</div>}
      {categoryOpen && category.projects.map((project) => (
        <ProjectBlock
          key={project.id}
          project={project}
          variant={variant}
          collapsedProjects={collapsedProjects}
          toggleProject={toggleProject}
          openRepos={openRepos}
          toggleRepo={toggleRepo}
          selectedWorkspace={selectedWorkspace}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}

function Sidebar({ variant, categories, setCategories, showDialog, showToast }) {
  const [collapsedCategories, setCollapsedCategories] = React.useState(new Set());
  const [collapsedProjects, setCollapsedProjects] = React.useState(new Set(["cloud"]));
  const [openRepos, setOpenRepos] = React.useState(new Set(["desktop-app", "desktop-site", "admin-web", "mobile-ios"]));
  const [selectedWorkspace, setSelectedWorkspace] = React.useState("sidebar");
  const [menuCategory, setMenuCategory] = React.useState(null);
  const [dragProjectId, setDragProjectId] = React.useState(null);
  const [overCategoryId, setOverCategoryId] = React.useState(null);
  const [focusCategory, setFocusCategory] = React.useState("superset");

  const toggleSet = (setter, id) => setter((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleDragStart = (event, projectId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
    setDragProjectId(projectId);
  };

  const handleDropProject = (targetCategoryId) => {
    if (!dragProjectId) return;
    let movedProject = null;
    const withoutProject = categories.map((category) => ({
      ...category,
      projects: category.projects.filter((project) => {
        if (project.id === dragProjectId) movedProject = project;
        return project.id !== dragProjectId;
      }),
    }));
    if (!movedProject) return;
    setCategories(withoutProject.map((category) =>
      category.id === targetCategoryId ? { ...category, projects: [...category.projects, movedProject] } : category,
    ));
    const targetName = categories.find((category) => category.id === targetCategoryId)?.name;
    showToast(`已移动到 ${targetName}`);
    setDragProjectId(null);
    setOverCategoryId(null);
  };

  const visibleCategories = variant === "focus"
    ? categories.filter((category) => category.id === focusCategory)
    : categories;
  const selectedCategory = categories.find((category) => category.id === focusCategory) ?? categories[0];

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">Workspaces</span>
        <IconButton title="搜索"><Icon name="search" size={14} /></IconButton>
        <IconButton title="新建 Workspace"><Icon name="plus" size={14} /></IconButton>
      </div>
      <div className="sidebar-body" onClick={() => menuCategory && setMenuCategory(null)}>
        {variant === "focus" && (
          <>
            <div className="focus-picker">
              {categories.map((category) => (
                <button className={`focus-chip ${category.id === focusCategory ? "active" : ""}`} key={category.id} onClick={() => setFocusCategory(category.id)} type="button">
                  <span className="category-dot" style={{ "--category-color": category.color }}></span>
                  {category.name}
                </button>
              ))}
            </div>
            <div className="focus-overview">
              <strong>{selectedCategory.name}</strong>
              <span>{selectedCategory.projects.length} 个项目 · {countWorkspaces(selectedCategory)} 个 Workspace</span>
            </div>
          </>
        )}
        {visibleCategories.map((category) => (
          <CategoryBlock
            key={category.id}
            category={category}
            variant={variant === "focus" ? "tree" : variant}
            collapsedCategories={collapsedCategories}
            toggleCategory={(id) => toggleSet(setCollapsedCategories, id)}
            collapsedProjects={collapsedProjects}
            toggleProject={(id) => toggleSet(setCollapsedProjects, id)}
            openRepos={openRepos}
            toggleRepo={(id) => toggleSet(setOpenRepos, id)}
            selectedWorkspace={selectedWorkspace}
            onSelect={setSelectedWorkspace}
            menuCategory={menuCategory}
            setMenuCategory={setMenuCategory}
            onAddCategory={() => showDialog("project")}
            onRename={(id) => showDialog("rename", id)}
            onDelete={() => showToast("分类非空，先移出项目")}
            draggingProject={{ id: dragProjectId, overCategory: overCategoryId, setOver: setOverCategoryId }}
            onDragStart={handleDragStart}
            onDragEnd={() => { setDragProjectId(null); setOverCategoryId(null); }}
            onDropProject={handleDropProject}
          />
        ))}
      </div>
      <div className="sidebar-foot">
        <Icon name="cloud" size={13} />
        <span>2 hosts online</span>
        <span className="status-spacer"></span>
        <button className="text-button" onClick={() => showDialog("category")} type="button"><Icon name="plus" size={13} /></button>
      </div>
    </aside>
  );
}

function MainContent() {
  return (
    <main className="main">
      <div className="workspace-tabs">
        <button className="tab active" type="button"><span className="state-dot running"></span>feat/project-groups</button>
        <button className="tab" type="button"><Icon name="plus" size={12} /></button>
      </div>
      <div className="chat">
        <div className="conversation">
          <div className="user-message">把左侧栏的项目整理一下：一个产品下面可能有多个项目，一个项目也会关联多个仓库。</div>
          <div className="assistant-message">
            <div className="assistant-title">我会把“业务归属”和“代码边界”分开表达。</div>
            <div>分类负责表达产品 / 业务线，项目作为管理单元，仓库只在项目展开后出现，Workspace 仍是最终可点击对象。</div>
            <div className="reasoning">
              <div className="reasoning-head"><Icon name="spark" size={13} /> Exploring sidebar hierarchy</div>
            </div>
          </div>
        </div>
        <div className="composer">
          <textarea aria-label="消息" placeholder="Ask anything, use @ to mention…"></textarea>
          <div className="composer-bar"><Icon name="plus" size={13} /><span>pi</span><span>Claude Opus 4.1</span><span className="composer-spacer"></span><Kbd>⌘↵</Kbd></div>
        </div>
      </div>
    </main>
  );
}

function RightPanel() {
  return (
    <aside className="right-panel">
      <div className="right-head">Changes <span className="status-spacer"></span><span className="count">4</span></div>
      <div className="files">
        <div className="file"><span className="file-status">M</span><span>WorkspaceSidebar.tsx</span></div>
        <div className="file"><span className="file-status">M</span><span>ProjectSection.tsx</span></div>
        <div className="file"><span className="file-status">A</span><span>RepositoryGroup.tsx</span></div>
        <div className="file"><span className="file-status">A</span><span>ProductCategory.tsx</span></div>
      </div>
    </aside>
  );
}

function Rail() {
  return (
    <nav className="rail">
      <div className="rail-mark">S</div>
      <button className="rail-button active" type="button"><Icon name="spark" size={15} /></button>
      <button className="rail-button" type="button"><Icon name="branch" size={15} /></button>
      <button className="rail-button" type="button"><Icon name="terminal" size={15} /></button>
      <div className="rail-spacer"></div>
      <button className="rail-button" type="button"><Icon name="moreH" size={15} /></button>
    </nav>
  );
}

function App() {
  const [variantId, setVariantId] = React.useState("tree");
  const [categories, setCategories] = React.useState(initialCategories);
  const [dialogMode, setDialogMode] = React.useState(null);
  const [dialogTarget, setDialogTarget] = React.useState(null);
  const [draftName, setDraftName] = React.useState("");
  const [toastMessage, setToastMessage] = React.useState(null);

  const showToast = (message) => {
    setToastMessage(message);
    window.clearTimeout(window.__sidebarToastTimer);
    window.__sidebarToastTimer = window.setTimeout(() => setToastMessage(null), 2400);
  };

  const showDialog = (mode, target = null) => {
    setDialogMode(mode);
    setDialogTarget(target);
    if (mode === "rename") setDraftName(categories.find((category) => category.id === target)?.name ?? "");
    else setDraftName("");
  };

  const saveDialog = () => {
    const cleanName = draftName.trim();
    if (!cleanName) return;
    if (dialogMode === "category") {
      setCategories((items) => [...items, { id: `category-${Date.now()}`, name: cleanName, color: "var(--warning)", projects: [] }]);
      showToast(`已创建分类 ${cleanName}`);
    } else if (dialogMode === "rename") {
      setCategories((items) => items.map((item) => item.id === dialogTarget ? { ...item, name: cleanName } : item));
      showToast(`已重命名为 ${cleanName}`);
    } else {
      showToast(`已准备添加项目 ${cleanName}`);
    }
    setDialogMode(null);
  };

  const activeDescription = {
    tree: "推荐 · 信息密度最高，四层结构始终可见；适合日常在多个仓库间切换。",
    cards: "仓库边界最清楚；适合项目不多、但每个项目的仓库职责需要被强调。",
    focus: "一次只看一个产品分类；适合分类较多，希望侧边栏保持安静的团队。",
  }[variantId];

  return (
    <div className="prototype" data-screen-label="项目与多仓库侧边栏">
      <div className="titlebar">
        <div className="traffic"><span></span><span></span><span></span></div>
        <div className="titlebar-name">Superset · project-repository-sidebar</div>
        <div className="titlebar-note">拖动项目到分类标题可重新归组</div>
      </div>
      <div className="variant-bar">
        <span className="variant-label">方案</span>
        {variantOptions.map((option) => (
          <button className={`variant-btn ${variantId === option.id ? "active" : ""}`} key={option.id} onClick={() => setVariantId(option.id)} type="button">{option.label}</button>
        ))}
      </div>
      <div className="app-shell">
        <Rail />
        <Sidebar variant={variantId} categories={categories} setCategories={setCategories} showDialog={showDialog} showToast={showToast} />
        <MainContent />
        <RightPanel />
      </div>
      <div className="statusbar"><span><span className="state-dot ok" style={{ display: "inline-block", marginRight: 6 }}></span>Local</span><span>main</span><span className="status-spacer"></span><span>3 repositories · 4 workspaces</span></div>
      <div className="design-note"><strong>{variantOptions.find((option) => option.id === variantId)?.label}</strong><br />{activeDescription}</div>
      {toastMessage && <div className="toast-wrap"><Toast tone="success">{toastMessage}</Toast></div>}
      <Dialog open={Boolean(dialogMode)} onClose={() => setDialogMode(null)} width={440}>
        <DialogHeader
          title={dialogMode === "category" ? "新建产品分类" : dialogMode === "rename" ? "重命名分类" : "添加项目"}
          description={dialogMode === "category" ? "分类用于聚合属于同一产品或业务线的项目。" : dialogMode === "project" ? "项目下可以继续关联一个或多个 Git 仓库。" : "修改分类名称不会改变项目或仓库。"}
          onClose={() => setDialogMode(null)}
        />
        <div className="modal-copy">
          <label className="field-label" htmlFor="group-name">{dialogMode === "project" ? "项目名称" : "分类名称"}</label>
          <input id="group-name" autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveDialog()} placeholder={dialogMode === "project" ? "例如：Superset Desktop" : "例如：Superset 产品"} />
        </div>
        <DialogFooter><Button onClick={() => setDialogMode(null)}>取消</Button><Button variant="primary" onClick={saveDialog}>保存</Button></DialogFooter>
      </Dialog>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
