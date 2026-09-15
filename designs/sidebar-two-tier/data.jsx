/* Mock data mirroring the user's real sidebar, plus the house icon set.
   Icons follow the design system's spec: 24 viewBox, currentColor stroke,
   strokeWidth 1.7, round caps — same质感 as the bundle's Icon, extended with
   the glyphs the sidebar needs (the guide allows extending, not swapping in a
   CDN set). */

const GLYPHS = {
	workflow: (
		<>
			<rect x="3" y="3" width="6" height="6" rx="1.5" />
			<rect x="15" y="15" width="6" height="6" rx="1.5" />
			<path d="M9 6h4a2 2 0 0 1 2 2v8" />
		</>
	),
	todo: (
		<>
			<path d="M3 5.5 4.6 7 7.5 4" />
			<path d="M3 12.5 4.6 14 7.5 11" />
			<path d="M3 19.5 4.6 21 7.5 18" />
			<path d="M11 5.5h10M11 12.5h10M11 19.5h6" />
		</>
	),
	clock: (
		<>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M12 7.5V12l3 1.8" />
		</>
	),
	brain: (
		<>
			<path d="M12 5.2a2.7 2.7 0 0 0-5 1.4 2.6 2.6 0 0 0-1.4 4.5A2.8 2.8 0 0 0 7 16.4a2.6 2.6 0 0 0 5 .9z" />
			<path d="M12 5.2a2.7 2.7 0 0 1 5 1.4 2.6 2.6 0 0 1 1.4 4.5 2.8 2.8 0 0 1-1.4 5.3 2.6 2.6 0 0 1-5 .9z" />
		</>
	),
	ports: (
		<>
			<circle cx="12" cy="12" r="2" />
			<path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" />
			<path d="M5.8 18.2a9 9 0 0 1 0-12.4M18.2 5.8a9 9 0 0 1 0 12.4" />
		</>
	),
	settings: (
		<>
			<circle cx="12" cy="12" r="3.1" />
			<path d="M19.1 14.6a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.17a1.8 1.8 0 0 1-3.6 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.17a1.8 1.8 0 0 1 0-3.6h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06a1.8 1.8 0 1 1 2.55-2.55l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.17a1.8 1.8 0 1 1 3.6 0v.09a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.17a1.8 1.8 0 0 1 0 3.6h-.09a1.5 1.5 0 0 0-1.37.9z" />
		</>
	),
	folderPlus: (
		<>
			<path d="M3 7.5a2 2 0 0 1 2-2h3.8l1.7 2.2H19a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
			<path d="M12 11.8v5M9.5 14.3h5" />
		</>
	),
	sidebarToggle: (
		<>
			<rect x="3" y="4.5" width="18" height="15" rx="2.5" />
			<path d="M9.5 4.5v15" />
		</>
	),
	pr: (
		<>
			<circle cx="6.5" cy="5.5" r="2.2" />
			<circle cx="6.5" cy="18.5" r="2.2" />
			<circle cx="17.5" cy="18.5" r="2.2" />
			<path d="M6.5 7.7v8.6M17.5 16.3V9.5a2 2 0 0 0-2-2h-3.2" />
			<path d="M14.4 5.3 12.3 7.5l2.1 2.2" />
		</>
	),
};

/** House icon in the design system's line style. */
function Glyph({ name: glyphName, size = 14, className = "" }) {
	const body = GLYPHS[glyphName];
	if (!body) return null;
	return (
		<svg
			className={className}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{body}
		</svg>
	);
}

/* ---------------------------------------------------------------- data --- */

const NAV_ITEMS = [
	{ id: "automations", glyph: "workflow", label: "自动化任务" },
	{ id: "todos", glyph: "todo", label: "待办", alert: true },
	{ id: "temporary", glyph: "clock", label: "临时工作区" },
	{ id: "context", glyph: "brain", label: "Agent 上下文" },
];

/** One workspace. `state`: running | ok | warn | err | idle */
const PROJECT_GROUPS = [
	{
		id: "agentfabric",
		label: "AgentFabric",
		projects: [
			{
				id: "agent-fabric",
				name: "agent-fabric",
				branch: "master",
				state: "running",
				diff: { add: 214, del: 63 },
				pr: { num: "#17", state: "open" },
				hotkey: "⌘1",
			},
			{
				id: "agent-fabric-web",
				name: "agent-fabric-web",
				branch: "main",
				state: "ok",
				diff: { add: 31, del: 8 },
				hotkey: "⌘2",
			},
			{
				id: "fabric-runtime",
				name: "fabric-runtime",
				branch: "main",
				state: "idle",
				unread: true,
				hotkey: "⌘3",
			},
			{
				id: "fabric-eval",
				name: "fabric-eval",
				branch: "main",
				state: "idle",
				hotkey: "⌘4",
			},
			{
				id: "agent-fabric-docs",
				name: "agent-fabric-docs",
				branch: "main",
				state: "warn",
				hotkey: "⌘5",
			},
		],
	},
	{
		id: "tokenverse",
		label: "Tokenverse",
		projects: [
			{
				id: "tokenverse",
				name: "tokenverse",
				branch: "main",
				state: "idle",
				hotkey: "⌘6",
			},
			{
				id: "tokenverse-indexer",
				name: "tokenverse-indexer",
				branch: "main",
				state: "err",
				hotkey: "⌘7",
			},
		],
	},
	{
		id: "agentx",
		label: "AgentX",
		projects: [
			{ id: "agentx", name: "agentx", branch: "main", state: "idle" },
			{
				id: "agentx-bench",
				name: "agentx-bench",
				branch: "main",
				state: "idle",
			},
		],
	},
	{
		id: "superset",
		label: "Superset",
		projects: [
			{
				id: "superset",
				name: "superset",
				branch: "main",
				state: "running",
				active: true,
				diff: { add: 54, del: 12 },
				/* Revealed by the 多 workspace toggle — the third tier only ever
				   appears for a project that genuinely has more than one. */
				extraWorkspaces: [
					{
						id: "kro-suite",
						name: "kro-suite",
						branch: "feat/acp-agent-control-plane",
						state: "running",
						diff: { add: 128, del: 42 },
						pr: { num: "#4213", state: "open" },
					},
					{
						id: "reap-legacy",
						name: "reap-legacy",
						branch: "bugfix/reap-legacy-orphans",
						state: "ok",
						diff: { add: 34, del: 208 },
						pr: { num: "#4198", state: "merged" },
					},
				],
			},
		],
	},
	{
		id: "user",
		label: "User",
		projects: [
			{
				id: "ai-running-coach",
				name: "ai-running-coach",
				branch: "main",
				state: "idle",
			},
		],
	},
];

const PORT_GROUPS = [
	{
		id: "superset",
		project: "superset",
		ports: [
			{ port: 3000, label: "web" },
			{ port: 5881, label: "api" },
		],
	},
	{
		id: "agent-fabric",
		project: "agent-fabric",
		ports: [{ port: 3001, label: "web" }],
	},
];

/** Flatten to the rows a variant renders, honouring the multi-workspace toggle. */
function buildRows(projectItem, showMulti) {
	const extra = showMulti ? (projectItem.extraWorkspaces ?? []) : [];
	if (extra.length === 0) return { merged: true, children: [] };
	return { merged: false, children: extra };
}

Object.assign(window, {
	Glyph,
	NAV_ITEMS,
	PROJECT_GROUPS,
	PORT_GROUPS,
	buildRows,
});
