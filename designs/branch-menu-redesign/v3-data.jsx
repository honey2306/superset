// Static-but-realistic mock data used across the v3 scene.
const V3_LOCAL_BRANCHES = [
	{
		name: "feat/kro-suite",
		lastCommit: "wire ACP command palette",
		relative: "just now",
		ahead: 3,
		behind: 0,
		author: "wufan17",
		hasRemote: true,
		starred: true,
	},
	{
		name: "backup/pre-filter-kro-suite",
		lastCommit: "snapshot before filter cutover",
		relative: "2h ago",
		ahead: 0,
		behind: 0,
		author: "wufan17",
		hasRemote: false,
	},
	{
		name: "backup/pre-filter-ui-v2",
		lastCommit: "snapshot ui-v2 filter drawer",
		relative: "5h",
		ahead: 0,
		behind: 0,
		author: "wufan17",
		hasRemote: false,
	},
	{
		name: "bugfix/duplicate-delete-dialogs",
		lastCommit: "dedupe delete confirm",
		relative: "yesterday",
		ahead: 1,
		behind: 0,
		author: "wufan17",
		hasRemote: true,
	},
	{
		name: "bugfix/reap-legacy-orphans",
		lastCommit: "reap orphan workspace rows",
		relative: "2d",
		ahead: 0,
		behind: 2,
		author: "wufan17",
		hasRemote: true,
	},
	{
		name: "electron-final",
		lastCommit: "cut electron 32 baseline",
		relative: "3d",
		ahead: 0,
		behind: 4,
		author: "wufan17",
		hasRemote: true,
	},
	{
		name: "feat/alt_updater",
		lastCommit: "alt updater PoC",
		relative: "3d",
		ahead: 2,
		behind: 0,
		author: "wufan17",
		hasRemote: true,
	},
	{
		name: "feat/browser-extension-bridge",
		lastCommit: "wire chrome extension bridge",
		relative: "4d",
		ahead: 6,
		behind: 0,
		author: "wufan17",
		hasRemote: true,
	},
	{
		name: "feat/browser-use",
		lastCommit: "browser-use agent scaffold",
		relative: "5d",
		ahead: 0,
		behind: 0,
		author: "wufan17",
		hasRemote: true,
	},
	{
		name: "main",
		lastCommit: "chore: bump kro workspace deps",
		relative: "1w",
		ahead: 1,
		behind: 12,
		author: "wufan17",
		hasRemote: true,
		starred: true,
	},
	{
		name: "chore/deps-2026-08",
		lastCommit: "bump deps",
		relative: "1w",
		ahead: 0,
		behind: 0,
		author: "wufan17",
		hasRemote: true,
	},
];

const V3_REMOTE_BRANCHES = [
	{ name: "feat/mcp-cursor-connector", relative: "3d", author: "renyj" },
	{ name: "feat/terminal-picker", relative: "5d", author: "sonic" },
	{ name: "release/2026-08", relative: "1w", author: "release-bot" },
	{ name: "fix/pty-flush-timing", relative: "1w", author: "hollis" },
];

const V3_CHANGED_FILES = [
	{
		dir: "apps/desktop/src/renderer/screens/",
		file: "MainView.tsx",
		status: "M",
	},
	{ dir: "apps/desktop/src/main/", file: "index.ts", status: "M" },
	{
		dir: "apps/desktop/src/lib/trpc/routers/",
		file: "branches.ts",
		status: "M",
	},
	{
		dir: "apps/desktop/src/renderer/hooks/",
		file: "useBranchMenu.ts",
		status: "A",
	},
	{
		dir: "apps/desktop/src/renderer/screens/main/components/…/",
		file: "BranchMenu.tsx",
		status: "M",
	},
	{ dir: "designs/branch-menu-redesign/", file: "v3.css", status: "A" },
	{
		dir: "designs/branch-menu-redesign/",
		file: "Branch Menu v3.html",
		status: "A",
	},
	{ dir: "packages/ui/src/", file: "popover.tsx", status: "M" },
	{
		dir: "apps/desktop/src/main/lib/",
		file: "host-service-coordinator.ts",
		status: "M",
	},
];

// Which scenarios can be pre-selected via the strip above the scene.
const V3_SCENARIOS = [
	{
		id: "closed",
		label: "Pill 关闭",
		description: "什么都没打开,只显示 pill 在 sidebar 里的静态状态。",
		open: false,
		ctxFor: null,
	},
	{
		id: "open",
		label: "Popover 打开",
		description: "点击 pill 后的分支列表。",
		open: true,
		ctxFor: null,
	},
	{
		id: "ctx-any",
		label: "右键其他分支",
		description:
			"非当前分支被右键,菜单会显示 switch / merge / pull / rename / delete。",
		open: true,
		ctxFor: "feat/browser-use",
	},
	{
		id: "ctx-current",
		label: "右键当前分支",
		description:
			"当前分支被右键,菜单会禁用 switch / merge / delete,允许 pull / push / rename / copy。",
		open: true,
		ctxFor: "feat/kro-suite",
	},
];

Object.assign(window, {
	V3_LOCAL_BRANCHES,
	V3_REMOTE_BRANCHES,
	V3_CHANGED_FILES,
	V3_SCENARIOS,
});
