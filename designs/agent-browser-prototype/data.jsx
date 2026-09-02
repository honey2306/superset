const agentBrowserPages = [
  {
    id: "local",
    title: "Superset · Workspace",
    shortTitle: "localhost:5173",
    url: "http://localhost:5173/workspace/agent-browser",
    domain: "localhost:5173",
    state: "active",
    activity: "正在验证 Browser pane",
    kind: "app",
  },
  {
    id: "github",
    title: "feat(desktop): add agent browser pane",
    shortTitle: "PR #8421",
    url: "https://github.com/superset-sh/superset/pull/8421",
    domain: "github.com",
    state: "background",
    activity: "2 分钟前读取",
    kind: "github",
  },
  {
    id: "docs",
    title: "Electron WebContentsView",
    shortTitle: "Electron Docs",
    url: "https://www.electronjs.org/docs/latest/api/web-contents-view",
    domain: "electronjs.org",
    state: "background",
    activity: "5 分钟前读取",
    kind: "docs",
  },
  {
    id: "issue",
    title: "SUPER-1842 · Built-in browser",
    shortTitle: "Linear · SUPER-1842",
    url: "https://linear.app/superset/issue/SUPER-1842",
    domain: "linear.app",
    state: "background",
    activity: "7 分钟前读取",
    kind: "linear",
  },
  {
    id: "search",
    title: "WebContentsView pointer events",
    shortTitle: "Search results",
    url: "https://www.google.com/search?q=electron+webcontentsview+pointer+events",
    domain: "google.com",
    state: "temporary",
    activity: "临时页面",
    kind: "search",
  },
];

const prototypeVariants = [
  {
    key: "A",
    slug: "split",
    name: "Companion Pane",
    summary: "复用 Superset 原生分屏",
  },
  {
    key: "B",
    slug: "dock",
    name: "Conversation Dock",
    summary: "Browser 收进对话内部",
  },
  {
    key: "C",
    slug: "focus",
    name: "Browser Focus",
    summary: "操作时 Browser 成为主画面",
  },
];

Object.assign(window, { agentBrowserPages, prototypeVariants });
