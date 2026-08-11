const sidebarProjectData = [
  { id: "superset", title: "superset", workspaces: [
    { id: "superset-retry", title: "CDP M5 terminal retry", branch: "cdp-m5-terminal-retry-202608…" },
    { id: "superset-fusion", title: "terminal fusion smoke", branch: "codex/terminal-fusion-smoke" },
    { id: "superset-local", title: "local", branch: "feat/acp-agent-control-plane" }
  ]},
  { id: "mini-krow", title: "mini-krow", workspaces: [
    { id: "mini-krow-local", title: "local", branch: "main" }
  ]},
  { id: "temporary", title: "temporary", workspaces: [
    { id: "temporary-local", title: "local", branch: "main" }
  ]},
  { id: "cdp-m5-import", title: "CDP M5 import…", workspaces: [
    { id: "cdp-m5-import-local", title: "local", branch: "main" }
  ]},
  { id: "cdp-m5-empty", title: "cdp-m5-empty", workspaces: [
    { id: "cdp-m5-empty-local", title: "local", branch: "main" }
  ]}
];

const sidebarVariantInfo = [
  { key: "A", title: "分组面板", rationale: "项目边界明确，workspace 落在内嵌面里。" },
  { key: "B", title: "目录大纲", rationale: "缩进与导轨直接讲清父子关系，项目留白更充足。" },
  { key: "C", title: "章节标签", rationale: "最少容器，靠排版分层，适合高密度浏览。" }
];

window.SidebarHierarchyData = { sidebarProjectData, sidebarVariantInfo };
