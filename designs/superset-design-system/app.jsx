// Superset Design System — full app shell demo.
// Uses everything in components.css + app.css + tokens.

const WORKSPACES = [
	{
		id: "wf1",
		name: "feat/kro-suite",
		state: "running",
		meta: "3m",
		active: true,
	},
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

const BATCHED = [
	{ id: "b1", name: "chore/deps-2026-08", state: "ok", meta: "1w" },
	{ id: "b2", name: "release/2026-08", state: "idle", meta: "1w" },
];

function StatusDot({ state }) {
	const map = { running: "", ok: "ok", err: "err", warn: "", idle: "idle" };
	return <span className={`status-dot ${map[state] ?? ""}`} />;
}

function WinChrome() {
	return (
		<div className="win-chrome">
			<div className="lights">
				<span className="light r" />
				<span className="light y" />
				<span className="light g" />
				<span
					className="mono faint"
					style={{ marginLeft: "var(--s-6)", fontSize: "var(--fs-10)" }}
				>
					wufan · superset
				</span>
			</div>
			<div className="tabs-strip">
				<button className="win-tab is-active">
					<IconBranch className="glyph" />
					<span className="name">feat/kro-suite</span>
					<span className="dot" title="unsaved" />
					<span className="close">
						<IconX size={10} />
					</span>
				</button>
				<button className="win-tab">
					<IconBranch className="glyph" />
					<span className="name">bugfix/reap-legacy-orphans</span>
					<span className="close">
						<IconX size={10} />
					</span>
				</button>
				<button className="win-tab">
					<IconBranch className="glyph" />
					<span className="name">chore/deps-2026-08</span>
					<span className="close">
						<IconX size={10} />
					</span>
				</button>
				<button className="icon-btn" title="New tab">
					<IconPlus />
				</button>
			</div>
			<div className="win-actions">
				<span className="chip">
					<IconSpark />
					<span>Opus 5</span>
				</span>
				<button className="icon-btn">
					<IconRefresh />
				</button>
				<button className="icon-btn">
					<IconMoreH />
				</button>
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
					<button className="icon-btn" title="New workspace">
						<IconPlus />
					</button>
				</span>
			</div>
			<div className="search-row">
				<label className="input">
					<IconSearch className="glyph" />
					<input placeholder="Jump to workspace…" />
					<span className="kbd" style={{ marginRight: "var(--s-3)" }}>
						⌘K
					</span>
				</label>
			</div>

			<div className="group">
				<span>Workspaces</span>
				<span className="count">5</span>
			</div>
			<div className="ws-list">
				{WORKSPACES.map((w) => (
					<button
						key={w.id}
						className={`ws-item${active === w.id ? " is-active" : ""}`}
						onClick={() => setActive(w.id)}
					>
						<StatusDot state={w.state} />
						<span className="name">{w.name}</span>
						<span className="meta">{w.meta}</span>
					</button>
				))}
			</div>

			<div className="group">
				<span>Batch · release-2026-08</span>
				<span className="count">2</span>
			</div>
			<div className="ws-list">
				{BATCHED.map((w) => (
					<button
						key={w.id}
						className={`ws-item${active === w.id ? " is-active" : ""}`}
						onClick={() => setActive(w.id)}
					>
						<StatusDot state={w.state} />
						<span className="name">{w.name}</span>
						<span className="meta">{w.meta}</span>
					</button>
				))}
			</div>

			<div className="foot">
				<span className="mono faint">v1.19.0</span>
				<span className="spacer" />
				<button className="icon-btn" title="Settings">
					<IconMoreH />
				</button>
			</div>
		</aside>
	);
}

function ToolCall({ name, arg, body, done = true, seconds = "1.2" }) {
	return (
		<div className="tool-call">
			<div className="th">
				<IconTerminal className="glyph" />
				<span className="name">{name}</span>
				<span className="arg">{arg}</span>
				<span className="spacer" />
				<span className="status">
					{done ? (
						<>
							<IconCheck size={11} /> {seconds}s
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

function CodeBlock({ file, children }) {
	return (
		<div className="code-block">
			<div className="th">
				<IconFile size={11} />
				<span>{file}</span>
				<span className="spacer" />
				<button className="icon-btn">
					<IconCopy />
				</button>
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

					<ToolCall
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

					<CodeBlock file="apps/desktop/src/renderer/…/BranchRow.tsx">
						{`<div className="b-row"
  onClick={onSwitch}
  onContextMenu={onRowContext}>
  <IconBranch className="glyph" />
  <span className="name">{branch.name}</span>
  {ab.length ? <span className="tag">{ab.join("  ")}</span> : null}
  <span className="end">
    {isCurrent ? <IconCheck size={12} /> : branch.relative}
  </span>
</div>`}
					</CodeBlock>

					<ToolCall
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

					<ToolCall
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
					<button className="icon-btn" title="Attach">
						<IconPlus />
					</button>
					<button className="icon-btn" title="Slash commands">
						<IconTerminal />
					</button>
					<span className="agent">
						<span className="dot" />
						Kro · Opus 5
					</span>
					<span className="kbd" style={{ marginLeft: "var(--s-4)" }}>
						⌘ + ↵
					</span>
					<span className="spacer" />
					<span className="mono faint">1,283 / 200k</span>
					<button className="send">
						<IconArrowRight size={12} />
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
				<IconCheck className="glyph" />
				<span>connected · host-service :5881</span>
			</span>
			<span className="item">
				<IconBranch className="glyph" />
				<span>feat/kro-suite · ↑ 3 ↓ 0</span>
			</span>
			<span className="item warn">
				<IconAlert className="glyph" />
				<span>5 files unstaged</span>
			</span>
			<span className="spacer" />
			<span className="item">Opus 5 · 200k ctx</span>
			<span className="item">UTC+8 · 14:03</span>
		</div>
	);
}

/* Right rail — the composed Changes panel (from preview.jsx, adapted) */
function ChangesPanel() {
	return (
		<div className="kit-changes">
			<div className="tabs">
				<button className="tab is-active">
					<IconChanges /> Changes
				</button>
				<button className="tab">
					<IconFile /> Files
				</button>
				<span style={{ flex: 1 }} />
				<button className="icon-btn">
					<IconMax />
				</button>
				<button className="icon-btn">
					<IconX />
				</button>
			</div>
			<div className="branch-bar">
				<button className="pill" aria-expanded="true">
					<IconBranch className="glyph" />
					<span className="label">feat/kro-suite</span>
					<IconChevron
						className="chev"
						style={{ transform: "rotate(180deg)" }}
					/>
				</button>
				<span style={{ flex: 1 }} />
				<button className="icon-btn">
					<IconSort />
				</button>
				<button className="icon-btn">
					<IconRefresh />
				</button>
			</div>

			{/* Popover mounted under the pill */}
			<div style={{ position: "relative" }}>
				<div
					className="popover floating"
					style={{ left: 12, top: -2, width: 340, position: "absolute" }}
				>
					<div className="popover-head">
						<IconSearch className="glyph" />
						<input placeholder="Jump to branch, or type to create…" />
					</div>
					<div className="popover-group">
						<span>本地分支 · 4</span>
						<button className="action">
							<IconPlus /> 新建
						</button>
					</div>
					<div>
						<div className="popover-row is-current">
							<IconBranch className="glyph" />
							<span className="name">feat/kro-suite</span>
							<span className="tag up">↑ 3</span>
							<span className="end">
								<IconCheck size={12} className="check-icon" />
							</span>
						</div>
						<div className="popover-row is-focused">
							<IconBranch className="glyph" />
							<span className="name">main</span>
							<span className="tag down">↓ 12</span>
							<span className="end">1w</span>
						</div>
						<div className="popover-row">
							<IconBranch className="glyph" />
							<span className="name">bugfix/reap-legacy-orphans</span>
							<span className="tag down">↓ 2</span>
							<span className="end">2d</span>
						</div>
						<div className="popover-row">
							<IconBranch className="glyph" />
							<span className="name">feat/browser-extension-bridge</span>
							<span className="tag up">↑ 6</span>
							<span className="end">4d</span>
						</div>
					</div>
					<div className="popover-sep" />
					<div className="popover-group">
						<span>远程 · 2</span>
						<button className="action">
							<IconRefresh /> Fetch
						</button>
					</div>
					<div>
						<div className="popover-row">
							<IconCloud className="glyph" />
							<span className="name">feat/mcp-cursor-connector</span>
							<span className="end">origin</span>
						</div>
					</div>
					<div className="popover-hint">
						<span>右键任意分支查看操作</span>
						<span className="row-3">
							<span className="kbd">↵</span>
							<span className="faint">切换</span>
						</span>
					</div>
				</div>
			</div>

			<div className="summary-bar">
				<span className="chip">
					<span className="dot mod" /> 5 modified
				</span>
				<span className="chip">
					<span className="dot add" /> 2 added
				</span>
				<span className="chip">
					<span className="dot del" /> 1 deleted
				</span>
				<span className="spacer" />
				<button className="icon-btn">
					<IconMoreH />
				</button>
			</div>

			<div className="files">
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">apps/desktop/src/renderer/</span>
					<span>MainView.tsx</span>
					<span className="badge mod">M</span>
				</div>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">apps/desktop/src/main/</span>
					<span>index.ts</span>
					<span className="badge mod">M</span>
				</div>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">apps/desktop/src/lib/trpc/routers/</span>
					<span>branches.ts</span>
					<span className="badge mod">M</span>
				</div>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">apps/desktop/src/renderer/hooks/</span>
					<span>useBranchMenu.ts</span>
					<span className="badge add">A</span>
				</div>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">apps/desktop/src/renderer/…/</span>
					<span>BranchMenu.tsx</span>
					<span className="badge mod">M</span>
				</div>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">packages/ui/src/</span>
					<span>popover.tsx</span>
					<span className="badge del">D</span>
				</div>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">designs/branch-menu-redesign/</span>
					<span>v3.css</span>
					<span className="badge add">A</span>
				</div>
			</div>

			<div className="commit">
				<textarea defaultValue="feat(branch-menu): move ops into right-click menu" />
				<div className="row">
					<span className="hint">
						On <b>feat/kro-suite</b> · 8 files
					</span>
					<button className="btn primary">
						<IconGitPush /> Commit & Push
					</button>
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
						<span className="chip">
							<span className="dot" style={{ background: "var(--success)" }} />
							running
						</span>
						<button className="icon-btn">
							<IconTerminal />
						</button>
						<button className="icon-btn">
							<IconMoreH />
						</button>
					</div>

					<div className="body">
						<ChatThread />
					</div>

					<Composer />

					<StatusBar />
				</div>

				<div className="right-rail">
					<ChangesPanel />
				</div>
			</div>

			<div className="toast-stack">
				<div className="toast success">
					<IconCheck className="glyph" />
					<span>已切换到 feat/kro-suite</span>
				</div>
				<div className="toast">
					<IconGitPull className="glyph" />
					<span>已拉取 main · 12 commits</span>
				</div>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
