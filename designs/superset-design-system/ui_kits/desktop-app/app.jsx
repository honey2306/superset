// Superset Desktop main view — composed entirely from the DS bundle. Renderer
// state (workspaces, threads, files) is fixture data; every visual comes from
// window.SupersetDesignSystem_91a6da.

const {
	Icon,
	IconButton,
	Button,
	Pill,
	Badge,
	Chip,
	Tag,
	Kbd,
	Input,
	Toast,
	Tabs,
	FileRow,
	WorkspaceItem,
	Popover,
	PopoverHeader,
	PopoverGroup,
	PopoverRow,
	PopoverSep,
	PopoverHint,
} = window.SupersetDesignSystem_91a6da;

const WORKSPACES = [
	{ id: "wf1", name: "feat/kro-suite", state: "running", meta: "3m" },
	{ id: "wf2", name: "bugfix/reap-legacy-orphans", state: "ok", meta: "2d" },
	{ id: "wf3", name: "backup/pre-filter-kro-suite", state: "idle", meta: "5h" },
	{
		id: "wf4",
		name: "feat/browser-extension-bridge",
		state: "warn",
		meta: "4d",
	},
	{ id: "wf5", name: "electron-final", state: "err", meta: "3d" },
];
const BATCH = [
	{ id: "b1", name: "chore/deps-2026-08", state: "ok", meta: "1w" },
	{ id: "b2", name: "release/2026-08", state: "idle", meta: "1w" },
];

function WinChrome() {
	return (
		<div className="win-chrome">
			<div className="lights">
				<span className="light r" />
				<span className="light y" />
				<span className="light g" />
				<span
					className="mono faint"
					style={{ marginLeft: 12, fontSize: "var(--fs-10)" }}
				>
					wufan · superset
				</span>
			</div>
			<div className="tabs-strip">
				<button className="win-tab is-active">
					<Icon name="branch" className="glyph" size={11} />
					<span className="name">feat/kro-suite</span>
					<span className="dot" title="unsaved" />
					<span className="close">
						<Icon name="x" size={10} />
					</span>
				</button>
				<button className="win-tab">
					<Icon name="branch" className="glyph" size={11} />
					<span className="name">bugfix/reap-legacy-orphans</span>
					<span className="close">
						<Icon name="x" size={10} />
					</span>
				</button>
				<button className="win-tab">
					<Icon name="branch" className="glyph" size={11} />
					<span className="name">chore/deps-2026-08</span>
					<span className="close">
						<Icon name="x" size={10} />
					</span>
				</button>
				<IconButton title="New tab">
					<Icon name="plus" />
				</IconButton>
			</div>
			<div className="win-actions">
				<Chip>
					<Icon name="spark" size={12} /> Opus 5
				</Chip>
				<IconButton title="Refresh">
					<Icon name="refresh" />
				</IconButton>
				<IconButton title="More">
					<Icon name="moreH" />
				</IconButton>
			</div>
		</div>
	);
}

function Sidebar({ active, setActive }) {
	return (
		<aside className="side">
			<div className="head">
				<span className="avatar">SU</span>
				<span className="who">
					<span className="name">superset</span>
					<span className="org">wufan17 · main</span>
				</span>
				<span className="push">
					<IconButton title="New workspace">
						<Icon name="plus" />
					</IconButton>
				</span>
			</div>
			<div className="search-row">
				<Input
					iconName="search"
					placeholder="Jump to workspace…"
					trailing={<Kbd>⌘K</Kbd>}
				/>
			</div>

			<div className="group">
				<span>Workspaces</span>
				<span className="count">{WORKSPACES.length}</span>
			</div>
			<div className="ws-list">
				{WORKSPACES.map((w) => (
					<WorkspaceItem
						key={w.id}
						name={w.name}
						state={w.state}
						meta={w.meta}
						active={active === w.id}
						onClick={() => setActive(w.id)}
					/>
				))}
			</div>

			<div className="group">
				<span>Batch · release-2026-08</span>
				<span className="count">{BATCH.length}</span>
			</div>
			<div className="ws-list">
				{BATCH.map((w) => (
					<WorkspaceItem
						key={w.id}
						name={w.name}
						state={w.state}
						meta={w.meta}
						active={active === w.id}
						onClick={() => setActive(w.id)}
					/>
				))}
			</div>

			<div className="foot">
				<span className="mono faint">v1.19.0</span>
				<span className="spacer" />
				<IconButton title="Settings">
					<Icon name="moreH" />
				</IconButton>
			</div>
		</aside>
	);
}

function ToolCallCard({ name, arg, body, done = true, seconds = "1.2" }) {
	return (
		<div className="tool-call">
			<div className="th">
				<Icon name="terminal" className="glyph" size={12} />
				<span className="name">{name}</span>
				<span className="arg">{arg}</span>
				<span className="spacer" />
				<span className="status">
					{done ? (
						<>
							<Icon name="check" size={11} /> {seconds}s
						</>
					) : (
						<>… running</>
					)}
				</span>
			</div>
			<div className="body">{body}</div>
		</div>
	);
}

function CodeBlockCard({ file, children }) {
	return (
		<div className="code-block">
			<div className="th">
				<Icon name="file" size={11} />
				<span>{file}</span>
				<span className="spacer" />
				<IconButton title="Copy">
					<Icon name="copy" />
				</IconButton>
			</div>
			<pre>{children}</pre>
		</div>
	);
}

function ChatThread() {
	return (
		<div className="thread">
			<div className="msg user">
				<span className="avatar">WF</span>
				<div className="content">
					<div className="who">
						You <span className="time">14:03</span>
					</div>
					<div className="text">
						<p>
							把 branch menu 的合并按钮从行内移到右键菜单里,并且加上{" "}
							<code>从此分支新建…</code> 的入口。要保留 ahead/behind badge。
						</p>
					</div>
				</div>
			</div>

			<div className="msg">
				<span className="avatar">Kro</span>
				<div className="content">
					<div className="who">
						Kro <span className="time">14:03 · Opus 5</span>
					</div>
					<div className="text">
						<p>
							好,我先看一下当前 <code>BranchMenu.tsx</code>{" "}
							是怎么组织的,再改到右键菜单里。
						</p>
					</div>

					<ToolCallCard
						name="Grep"
						arg='"onMerge" apps/desktop/src/renderer'
						body={
							<>
								<span className="ctx">apps/desktop/…/BranchMenu.tsx:104:</span>{" "}
								<span>
									onMerge={"{"}actions.merge{"}"}
								</span>
								{"\n"}
								<span className="ctx">apps/desktop/…/BranchRow.tsx:38:</span>{" "}
								<span>
									onMerge={"{"}onRowMerge{"}"}
								</span>
							</>
						}
					/>

					<div className="text">
						<p>
							把 <code>BranchRow</code> 里的 hover-only merge
							按钮删掉,合并动作接到 <code>ContextMenu</code> 上。这是新的行:
						</p>
					</div>

					<CodeBlockCard file="apps/desktop/src/renderer/…/BranchRow.tsx">{`<div className="b-row"
  onClick={onSwitch}
  onContextMenu={onRowContext}>
  <IconBranch className="glyph" />
  <span className="name">{branch.name}</span>
  {ab.length ? <span className="tag">{ab.join("  ")}</span> : null}
  <span className="end">
    {isCurrent ? <IconCheck size={12} /> : branch.relative}
  </span>
</div>`}</CodeBlockCard>

					<ToolCallCard
						name="Edit"
						arg="apps/desktop/…/BranchRow.tsx"
						body={
							<>
								<span className="del">
									-{" "}
									{
										'<button className="row-merge" onMerge={onMerge}>合并</button>'
									}
								</span>
								{"\n"}
								<span className="add">
									+{" "}
									{
										"onContextMenu={(e) => { e.preventDefault(); onRowContext(branch, e.clientX, e.clientY); }}"
									}
								</span>
							</>
						}
					/>

					<div className="text">
						<p>
							跑一下 typecheck 确认没别的地方还在引用旧的 <code>onMerge</code>{" "}
							prop。
						</p>
					</div>

					<ToolCallCard
						name="Bash"
						arg="bun run typecheck --filter apps/desktop"
						done={false}
						body={
							<>
								<span className="ctx">tsc --noEmit</span>
								{"\n"}
								<span className="ctx">Task apps/desktop:typecheck</span>
								{"\n"}
								<span>…</span>
							</>
						}
					/>
				</div>
			</div>
		</div>
	);
}

function Composer() {
	return (
		<div className="composer">
			<div className="box">
				<textarea defaultValue="加上 ⌘⇧B 打开分支菜单的快捷键,并且在 popover header 上显示这个 hint。" />
				<div className="toolbar">
					<IconButton title="Attach">
						<Icon name="plus" />
					</IconButton>
					<IconButton title="Slash commands">
						<Icon name="terminal" />
					</IconButton>
					<span className="agent">
						<span className="dot" />
						Kro · Opus 5
					</span>
					<Kbd className="ml-4">⌘ + ↵</Kbd>
					<span className="spacer" />
					<span className="mono faint">1,283 / 200k</span>
					<button className="send">
						<Icon name="arrowRight" size={12} />
						Send
					</button>
				</div>
			</div>
		</div>
	);
}

function StatusBar() {
	return (
		<div className="status-bar">
			<span className="item ok">
				<Icon name="check" className="glyph" /> connected · host-service :5881
			</span>
			<span className="item">
				<Icon name="branch" className="glyph" /> feat/kro-suite · ↑ 3 ↓ 0
			</span>
			<span className="item warn">
				<Icon name="alert" className="glyph" /> 5 files unstaged
			</span>
			<span className="spacer" />
			<span className="item">Opus 5 · 200k ctx</span>
			<span className="item">UTC+8 · 14:03</span>
		</div>
	);
}

function ChangesRail() {
	return (
		<div className="kit-changes">
			<Tabs
				value="Changes"
				items={[
					{ value: "Changes", label: "Changes", iconName: "changes" },
					{ value: "Files", label: "Files", iconName: "file" },
				]}
				trailing={
					<>
						<IconButton>
							<Icon name="max" />
						</IconButton>
						<IconButton>
							<Icon name="x" />
						</IconButton>
					</>
				}
			/>
			<div className="branch-bar">
				<Pill label="feat/kro-suite" open />
				<span style={{ flex: 1 }} />
				<IconButton>
					<Icon name="sort" />
				</IconButton>
				<IconButton>
					<Icon name="refresh" />
				</IconButton>
			</div>

			<div style={{ position: "relative" }}>
				<div
					className="floating"
					style={{ position: "absolute", left: 12, top: -2, width: 340 }}
				>
					<Popover>
						<PopoverHeader placeholder="Jump to branch, or type to create…" />
						<PopoverGroup
							label="本地分支"
							count={4}
							action={
								<button className="action">
									<Icon name="plus" /> 新建
								</button>
							}
						/>
						<PopoverRow
							name="feat/kro-suite"
							current
							tag={<Tag dir="up">3</Tag>}
						/>
						<PopoverRow
							name="main"
							focused
							tag={<Tag dir="down">12</Tag>}
							end="1w"
						/>
						<PopoverRow
							name="bugfix/reap-legacy-orphans"
							tag={<Tag dir="down">2</Tag>}
							end="2d"
						/>
						<PopoverRow
							name="feat/browser-extension-bridge"
							tag={<Tag dir="up">6</Tag>}
							end="4d"
						/>
						<PopoverSep />
						<PopoverGroup
							label="远程"
							count={2}
							action={
								<button className="action">
									<Icon name="refresh" /> Fetch
								</button>
							}
						/>
						<PopoverRow
							iconName="cloud"
							name="feat/mcp-cursor-connector"
							end="origin"
						/>
						<PopoverHint>
							<span>右键任意分支查看操作</span>
							<span style={{ display: "inline-flex", gap: 6 }}>
								<Kbd>↵</Kbd>
								<span className="faint">切换</span>
							</span>
						</PopoverHint>
					</Popover>
				</div>
			</div>

			<div className="summary-bar">
				<Chip tone="mod">5 modified</Chip>
				<Chip tone="add">2 added</Chip>
				<Chip tone="del">1 deleted</Chip>
				<span className="spacer" />
				<IconButton>
					<Icon name="moreH" />
				</IconButton>
			</div>

			<div className="files">
				<FileRow
					dir="apps/desktop/src/renderer/"
					file="MainView.tsx"
					status="M"
				/>
				<FileRow dir="apps/desktop/src/main/" file="index.ts" status="M" />
				<FileRow
					dir="apps/desktop/src/lib/trpc/routers/"
					file="branches.ts"
					status="M"
				/>
				<FileRow
					dir="apps/desktop/src/renderer/hooks/"
					file="useBranchMenu.ts"
					status="A"
				/>
				<FileRow
					dir="apps/desktop/src/renderer/…/"
					file="BranchMenu.tsx"
					status="M"
				/>
				<FileRow dir="packages/ui/src/" file="popover.tsx" status="D" />
				<FileRow dir="designs/branch-menu-redesign/" file="v3.css" status="A" />
			</div>

			<div className="commit">
				<textarea defaultValue="feat(branch-menu): move ops into right-click menu" />
				<div className="row">
					<span className="hint">
						On <b>feat/kro-suite</b> · 8 files
					</span>
					<Button variant="primary">
						<Icon name="push" /> Commit & Push
					</Button>
				</div>
			</div>
		</div>
	);
}

function App() {
	const [active, setActive] = React.useState("wf1");
	return (
		<div className="app-shell">
			<WinChrome />
			<div className="app-body">
				<Sidebar active={active} setActive={setActive} />

				<div className="main">
					<div className="bar">
						<span className="crumb">
							<span>superset</span>
							<span className="sep">/</span>
							<span>apps</span>
							<span className="sep">/</span>
							<span>desktop</span>
							<span className="sep">/</span>
							<span className="mono">feat/kro-suite</span>
						</span>
						<span className="spacer" />
						<Chip>
							<span className="dot" style={{ background: "var(--success)" }} />{" "}
							running
						</Chip>
						<IconButton>
							<Icon name="terminal" />
						</IconButton>
						<IconButton>
							<Icon name="moreH" />
						</IconButton>
					</div>

					<div className="body">
						<ChatThread />
					</div>

					<Composer />
					<StatusBar />
				</div>

				<div className="right-rail">
					<ChangesRail />
				</div>
			</div>

			<div className="toast-stack">
				<Toast tone="success">已切换到 feat/kro-suite</Toast>
				<Toast>
					<Icon name="pull" className="glyph" /> 已拉取 main · 12 commits
				</Toast>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
