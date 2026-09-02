const {
  Button,
  ContextMenu,
  Icon,
  Kbd,
  MenuGroup,
  MenuHeading,
  MenuItem,
  MenuSep,
  Toast,
} = window.SupersetDesignSystem_91a6da;

const initialProjectGroups = [
  {
    id: "superset-product",
    name: "Superset 产品",
    color: "var(--accent)",
    repositories: [
      {
        id: "superset",
        name: "superset",
        thumb: "S",
        count: 8,
        sections: [
          {
            id: "active",
            name: "Active",
            open: true,
            rows: [
              { id: "w1", title: "Project groups", branch: "feat/project-groups", status: "running", stats: { add: 128, del: 42 }, active: true },
              { id: "w2", title: "Reap legacy orphans", branch: "bugfix/reap-legacy-orphans", status: "ok", stats: { add: 34, del: 208 } },
            ],
          },
          { id: "backlog", name: "Backlog", open: false, rows: [{ id: "w3", title: "Electron final polish", branch: "electron-final", status: "warn" }] },
        ],
      },
      {
        id: "superset-site",
        name: "superset-site",
        thumb: "W",
        count: 2,
        sections: [
          { id: "active", name: "Active", open: true, rows: [{ id: "w4", title: "Launch page", branch: "feat/launch-page", status: "idle" }] },
        ],
      },
      {
        id: "superset-docs",
        name: "superset-docs",
        thumb: "D",
        count: 1,
        sections: [],
      },
    ],
  },
  {
    id: "internal-tools",
    name: "内部工具",
    color: "var(--accent-2)",
    repositories: [
      {
        id: "admin-web",
        name: "admin-web",
        thumb: "A",
        count: 3,
        sections: [
          { id: "active", name: "Active", open: true, rows: [{ id: "w5", title: "Audit log", branch: "feat/audit-log", status: "ok" }] },
        ],
      },
      {
        id: "admin-api",
        name: "admin-api",
        thumb: "A",
        count: 1,
        sections: [],
      },
    ],
  },
  {
    id: "ungrouped",
    name: "未分类",
    color: "var(--fg-faint)",
    repositories: [
      { id: "kro-cli", name: "kro-cli", thumb: "K", count: 3, sections: [] },
    ],
  },
];

const sidebarVariants = [
  { id: "section", label: "A · 分组标题" },
  { id: "rail", label: "B · 彩色分区" },
  { id: "switcher", label: "C · 分类切换" },
];

function StatusMark({ state }) {
  const color = state === "running" ? "var(--accent)" : state === "ok" ? "var(--success)" : state === "warn" ? "var(--warning)" : "var(--fg-faint)";
  if (state === "running") return <span className="spinner accent" style={{ width: 12, height: 12 }}></span>;
  return <span style={{ width: 8, height: 8, display: "inline-block", borderRadius: "var(--r-pill)", background: color }}></span>;
}

function CurrentWorkspaceRow({ row }) {
  return (
    <div className={`wsb-row ${row.active ? "is-active" : ""}`}>
      <div className="head">
        <span className="icon"><StatusMark state={row.status} /></span>
        <span className="title">{row.title}</span>
        {row.stats && <span className="stats"><span className="add">+{row.stats.add}</span><span className="del">−{row.stats.del}</span></span>}
        <span className="close"><Icon name="moreH" size={12} /></span>
      </div>
      <div className="sub"><span className="branch">{row.branch}</span></div>
    </div>
  );
}

function CurrentRepositoryBlock({ repository, collapsedRepositories, toggleRepository, onDragStart, onDragEnd }) {
  const repositoryOpen = !collapsedRepositories.has(repository.id);
  return (
    <div className="wsb-project" draggable onDragStart={(event) => onDragStart(event, repository.id)} onDragEnd={onDragEnd}>
      <div className="wsb-project-head" onClick={() => toggleRepository(repository.id)} role="button" tabIndex="0">
        <span className="thumb">{repository.thumb}</span>
        <span className="name">{repository.name}</span>
        <span className="count">({repository.count})</span>
        <span className="repo-meta">repo</span>
        <Icon name="plus" size={12} />
        <span style={{ transform: repositoryOpen ? "rotate(90deg)" : "none", transition: "transform var(--dur-quick)", display: "inline-flex" }}><Icon name="chevron" size={9} /></span>
      </div>
      {repositoryOpen && repository.sections.map((section) => (
        <React.Fragment key={`${repository.id}-${section.id}`}>
          <div className={`wsb-section-head ${section.open ? "is-open" : ""}`}>
            <Icon name="chevron" className="chev" size={8} />
            {section.name} <span>({section.rows.length})</span>
          </div>
          {section.open && section.rows.map((row) => <CurrentWorkspaceRow key={row.id} row={row} />)}
        </React.Fragment>
      ))}
    </div>
  );
}

function GroupMenu({ group, closeMenu, notify }) {
  return (
    <div className="group-menu" onClick={(event) => event.stopPropagation()}>
      <ContextMenu>
        <MenuHeading title={group.name} badge={`${group.repositories.length} repos`} />
        <MenuSep />
        <MenuGroup>项目组</MenuGroup>
        <MenuItem iconName="plus" label="关联仓库…" onClick={() => { closeMenu(); notify("已打开仓库选择器"); }} />
        <MenuItem iconName="edit" label="重命名项目组…" onClick={closeMenu} />
        <MenuItem iconName="sort" label="调整项目组顺序" onClick={closeMenu} />
        <MenuSep />
        <MenuItem iconName="trash" label="删除项目组" danger disabled={group.repositories.length > 0} title="项目组非空时不可删除" />
      </ContextMenu>
    </div>
  );
}

function ProjectGroupBlock({ group, variantId, collapsedGroups, toggleGroup, collapsedRepositories, toggleRepository, activeMenu, setActiveMenu, notify, dragging, setDragging, onDrop }) {
  const groupOpen = !collapsedGroups.has(group.id);
  const dropOver = dragging?.over === group.id;
  return (
    <div
      className={`project-group ${dropOver ? "drop-over" : ""}`}
      style={{ "--group-color": group.color }}
      onDragOver={(event) => { event.preventDefault(); if (dragging) setDragging({ ...dragging, over: group.id }); }}
      onDragLeave={() => dragging && setDragging({ ...dragging, over: null })}
      onDrop={(event) => { event.preventDefault(); onDrop(group.id); }}
    >
      <div className={`group-head ${groupOpen ? "" : "closed"}`} onClick={() => toggleGroup(group.id)}>
        <span className="chev"><Icon name="chevron" size={8} /></span>
        {variantId === "rail" && <span className="group-color" style={{ "--chip-color": group.color }}></span>}
        <span className="group-title">{group.name}</span>
        <span className="group-count">{group.repositories.length}</span>
        <span className="group-menu-anchor">
          <button className={`group-more ${activeMenu === group.id ? "open" : ""}`} type="button" onClick={(event) => { event.stopPropagation(); setActiveMenu(activeMenu === group.id ? null : group.id); }}><Icon name="moreH" size={13} /></button>
          {activeMenu === group.id && <GroupMenu group={group} closeMenu={() => setActiveMenu(null)} notify={notify} />}
        </span>
      </div>
      {dropOver && <div className="drop-message">把仓库放入「{group.name}」</div>}
      {groupOpen && (
        <div className="group-projects">
          {group.repositories.map((repository) => (
            <CurrentRepositoryBlock
              key={repository.id}
              repository={repository}
              collapsedRepositories={collapsedRepositories}
              toggleRepository={toggleRepository}
              onDragStart={(event, repositoryId) => { event.dataTransfer.effectAllowed = "move"; setDragging({ repositoryId, over: null }); }}
              onDragEnd={() => setDragging(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CurrentSidebar({ variantId, groups, setGroups, notify }) {
  const [collapsedGroups, setCollapsedGroups] = React.useState(new Set());
  const [collapsedRepositories, setCollapsedRepositories] = React.useState(new Set(["superset-site", "superset-docs", "admin-api", "kro-cli"]));
  const [activeMenu, setActiveMenu] = React.useState(null);
  const [selectedGroupId, setSelectedGroupId] = React.useState("superset-product");
  const [dragging, setDragging] = React.useState(null);

  const toggleSetItem = (setter, id) => setter((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const moveRepository = (targetGroupId) => {
    if (!dragging?.repositoryId) return;
    let movedRepository = null;
    const strippedGroups = groups.map((group) => ({
      ...group,
      repositories: group.repositories.filter((repository) => {
        if (repository.id === dragging.repositoryId) movedRepository = repository;
        return repository.id !== dragging.repositoryId;
      }),
    }));
    if (!movedRepository) return;
    setGroups(strippedGroups.map((group) => group.id === targetGroupId ? { ...group, repositories: [...group.repositories, movedRepository] } : group));
    notify(`已移动 ${movedRepository.name}`);
    setDragging(null);
  };

  const visibleGroups = variantId === "switcher" ? groups.filter((group) => group.id === selectedGroupId) : groups;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];

  return (
    <aside className={`wsb variant-${variantId}`} onClick={() => activeMenu && setActiveMenu(null)}>
      <div className="wsb-head">
        <button className="wsb-nav"><Icon name="spark" className="glyph" size={14} /> Automations</button>
        <button className="wsb-nav"><Icon name="check" className="glyph" size={14} /> Todos<span className="dot"></span></button>
        <button className="wsb-nav"><Icon name="refresh" className="glyph" size={14} /> Temporary workspace</button>
        <button className="wsb-nav"><Icon name="file" className="glyph" size={14} /> Project memory</button>
      </div>
      <div className="wsb-body">
        {variantId === "switcher" && (
          <>
            <div className="group-switcher">
              {groups.map((group) => (
                <button className={`group-chip ${selectedGroupId === group.id ? "active" : ""}`} key={group.id} onClick={() => setSelectedGroupId(group.id)} type="button">
                  <span className="group-color" style={{ "--chip-color": group.color }}></span>{group.name}
                </button>
              ))}
            </div>
            <div className="group-summary"><strong>{selectedGroup.name}</strong><span>{selectedGroup.repositories.length} 个仓库</span><span className="spacer"></span><Icon name="moreH" size={12} /></div>
          </>
        )}
        {visibleGroups.map((group) => (
          <ProjectGroupBlock
            key={group.id}
            group={group}
            variantId={variantId}
            collapsedGroups={collapsedGroups}
            toggleGroup={(id) => toggleSetItem(setCollapsedGroups, id)}
            collapsedRepositories={collapsedRepositories}
            toggleRepository={(id) => toggleSetItem(setCollapsedRepositories, id)}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            notify={notify}
            dragging={dragging}
            setDragging={setDragging}
            onDrop={moveRepository}
          />
        ))}
      </div>
      <div className="wsb-ports">
        <div className="wsb-ports-head"><Icon name="chevron" size={8} style={{ transform: "rotate(90deg)" }} /><Icon name="cloud" size={11} /> Ports<span className="count" style={{ marginLeft: "auto" }}>3</span></div>
        <div className="wsb-port-group"><div className="lbl">feat/project-groups</div><div className="ports"><span className="wsb-port-badge">3000 web</span><span className="wsb-port-badge">5881 api</span></div></div>
      </div>
      <div className="wsb-foot"><button className="wsb-add-repo" type="button"><Icon name="plus" size={12} /> Add repository</button><Button variant="ghost" size="sm">Settings</Button></div>
    </aside>
  );
}

function MainWorkspace() {
  return (
    <main className="preview-main">
      <div className="tabs"><button className="tab active" type="button"><span style={{ color: "var(--accent)" }}>●</span>Project groups</button><button className="tab" type="button"><Icon name="plus" size={12} /></button></div>
      <div className="chat-area">
        <div className="messages">
          <div className="user-msg">不是你还得结合一下现在的啊</div>
          <div className="assistant-msg"><strong>保留当前项目块和 Workspace 行，只加一层轻量项目组。</strong>现在的 ProjectHeader、Active / Backlog Section、Workspace 状态、Ports 和 Add repository 都不动；新增分组只负责把多个现有仓库项目放在一起。</div>
        </div>
        <div className="composer-v2"><textarea placeholder="Ask anything, use @ to mention…"></textarea><div className="composer-actions"><span>pi</span><span>Claude Opus 4.1</span><span className="spacer"></span><Kbd>⌘↵</Kbd></div></div>
      </div>
    </main>
  );
}

function ChangesPanel() {
  return <aside className="changes-panel"><div className="changes-head">Changes<span className="spacer"></span><span>3</span></div><div className="files"><div className="file"><span className="m">M</span><span>WorkspaceSidebar.tsx</span></div><div className="file"><span className="m">A</span><span>ProjectGroup.tsx</span></div><div className="file"><span className="m">M</span><span>ProjectSection.tsx</span></div></div></aside>;
}

function PreviewApp() {
  const [variantId, setVariantId] = React.useState("section");
  const [groups, setGroups] = React.useState(initialProjectGroups);
  const [toastText, setToastText] = React.useState(null);

  const notify = (text) => {
    setToastText(text);
    window.clearTimeout(window.__v2ToastTimer);
    window.__v2ToastTimer = window.setTimeout(() => setToastText(null), 2200);
  };

  const explanation = {
    section: "推荐：最接近现在。只在现有 ProjectHeader 上方增加一个类似 Section 的项目组标题，原来的仓库项目块完全保留。",
    rail: "沿用现在 Workspace Section 的彩色左边线，让项目组更容易扫视，但不增加卡片和额外背景。",
    switcher: "当项目组很多时，在现有侧边栏顶部切换分类；下面仍然是现在的 ProjectHeader 和 Workspace 行。",
  }[variantId];

  return (
    <div className="preview-app" data-screen-label="当前侧边栏融合方案">
      <div className="preview-titlebar"><div className="lights"><span></span><span></span><span></span></div><div className="window-title">Superset · current sidebar integration</div><div className="current-label">基于当前 WorkspaceSidebar</div></div>
      <div className="variant-panel"><span>融合方式</span>{sidebarVariants.map((variant) => <button className={`variant-button ${variantId === variant.id ? "active" : ""}`} key={variant.id} onClick={() => setVariantId(variant.id)} type="button">{variant.label}</button>)}</div>
      <div className="preview-body"><CurrentSidebar variantId={variantId} groups={groups} setGroups={setGroups} notify={notify} /><MainWorkspace /><ChangesPanel /></div>
      <div className="preview-status"><span style={{ color: "var(--success)" }}>●</span><span>Local</span><span>main</span><span className="spacer"></span><span>当前结构 + Project Group</span></div>
      <div className="design-explainer"><strong>{sidebarVariants.find((variant) => variant.id === variantId)?.label}</strong><br />{explanation}</div>
      {toastText && <div className="toast-host"><Toast tone="success">{toastText}</Toast></div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PreviewApp />);
