// Scene: fake code editor on the left, the sidebar on the right with a live
// popover + right-click menu.  Handles the toast layer and delete confirm.

function fakeCode() {
	return [
		{ c: "// apps/desktop/…/BranchMenu.tsx", k: "c" },
		{ c: 'import { useBranchMenu } from "./hooks/useBranchMenu";', k: "n" },
		{ c: "", k: "g" },
		{
			c: "export function BranchMenu({ workspaceId }: BranchMenuProps) {",
			k: "k",
		},
		{
			c: "  const { current, locals, remotes, actions } = useBranchMenu(workspaceId);",
			k: "n",
		},
		{ c: "", k: "g" },
		{ c: "  return (", k: "k" },
		{ c: "    <BranchPopover", k: "n" },
		{ c: "      current={current}", k: "n" },
		{ c: "      locals={locals}", k: "n" },
		{ c: "      remotes={remotes}", k: "n" },
		{ c: "      onSwitch={actions.switch}", k: "n" },
		{ c: "      onRowContext={actions.openContext}", k: "n" },
		{ c: "      onFetch={actions.fetch}", k: "n" },
		{ c: "    />", k: "n" },
		{ c: "  );", k: "k" },
		{ c: "}", k: "k" },
		{ c: "", k: "g" },
		{ c: "// operations moved off the row and into ContextMenu:", k: "c" },
		{ c: "//   switch · merge · pull · push · fetch", k: "c" },
		{ c: "//   rename · copy · open-in-terminal", k: "c" },
		{ c: "//   delete (with confirm)", k: "c" },
	];
}

function EditorPane({ current }) {
	const lines = fakeCode();
	return (
		<div className="frame-editor">
			<div className="frame-editor-crumb">
				<span>apps</span>
				<span className="sep">/</span>
				<span>desktop</span>
				<span className="sep">/</span>
				<span>src</span>
				<span className="sep">/</span>
				<span>renderer</span>
				<span className="sep">/</span>
				<span>…</span>
				<span className="sep">/</span>
				<span style={{ color: "var(--v2-text)" }}>BranchMenu.tsx</span>
				<span className="sep">·</span>
				<span>on</span>
				<span
					style={{
						color: "var(--v2-accent)",
						fontFamily: "'SF Mono', ui-monospace, monospace",
					}}
				>
					{current}
				</span>
			</div>
			<pre>
				{lines.map((l, i) => (
					<div key={i} className={l.k}>
						<span
							style={{
								color: "var(--v2-text-faint)",
								userSelect: "none",
								paddingRight: 14,
								display: "inline-block",
								width: 26,
								textAlign: "right",
							}}
						>
							{i + 1}
						</span>
						{l.c || " "}
					</div>
				))}
			</pre>
			<div className="frame-editor-fade" />
		</div>
	);
}

function ToastLayer({ toasts, dismiss }) {
	return (
		<div className="toast-wrap">
			{toasts.map((t) => (
				<div key={t.id} className={`toast ${t.kind}`}>
					<t.Icon className="glyph" />
					<span>{t.text}</span>
					<button
						className="rs-icon"
						style={{
							marginLeft: 6,
							width: 20,
							height: 20,
							color: "var(--v2-text-faint)",
						}}
						onClick={() => dismiss(t.id)}
					>
						<IconX />
					</button>
				</div>
			))}
		</div>
	);
}

function ScenarioStrip({ scenarios, current, onPick }) {
	return (
		<>
			{scenarios.map((s) => (
				<button
					key={s.id}
					className={`cta${current === s.id ? " is-active" : ""}`}
					onClick={() => onPick(s)}
					title={s.description}
				>
					{s.label}
				</button>
			))}
		</>
	);
}

function App() {
	const [currentBranch, setCurrentBranch] = React.useState("feat/kro-suite");
	const [popoverOpen, setPopoverOpen] = React.useState(true);
	const [query, setQuery] = React.useState("");
	const [ctx, setCtx] = React.useState(null); // { branch, isCurrent, x, y }
	const [confirm, setConfirm] = React.useState(null); // { branch, x, y }
	const [toasts, setToasts] = React.useState([]);
	const [scenarioId, setScenarioId] = React.useState("open");
	const [fetchSpinning, setFetchSpinning] = React.useState(false);
	// Right-click "从此分支新建…" hands a base ref to the popover's inline panel.
	const [createIntent, setCreateIntent] = React.useState(null);

	const q = query.trim().toLowerCase();
	const locals = V3_LOCAL_BRANCHES.filter((b) =>
		b.name.toLowerCase().includes(q),
	);
	const remotes = V3_REMOTE_BRANCHES.filter((b) =>
		b.name.toLowerCase().includes(q),
	);

	const pushToast = (text, kind = "info", Icon = IconCheck) => {
		const id = Math.random().toString(36).slice(2);
		setToasts((prev) => [...prev, { id, text, kind, Icon }]);
		setTimeout(
			() => setToasts((prev) => prev.filter((t) => t.id !== id)),
			4000,
		);
	};

	const openContextMenu = (branch, isCurrent, x, y) => {
		setCtx({ branch, isCurrent, x, y });
	};

	const doAction = (item, branch) => {
		setCtx(null);
		switch (item.id) {
			case "switch":
				setCurrentBranch(branch.name);
				setPopoverOpen(false);
				pushToast(`已切换到 ${branch.name}`, "success", IconCheck);
				break;
			case "merge":
				pushToast(
					`已把 ${branch.name} 合并到 ${currentBranch}`,
					"success",
					IconMerge,
				);
				break;
			case "pull":
				setFetchSpinning(true);
				setTimeout(() => {
					setFetchSpinning(false);
					pushToast(`已拉取 ${branch.name}`, "success", IconGitPull);
				}, 900);
				break;
			case "push":
				pushToast(`已推送 ${branch.name}`, "success", IconGitPush);
				break;
			case "fetch":
				setFetchSpinning(true);
				setTimeout(() => {
					setFetchSpinning(false);
					pushToast("已 fetch 全部远程分支", "success", IconRefresh);
				}, 900);
				break;
			case "checkout-new":
				// Open the same inline "create branch" panel, but pin its base to
				// this row instead of HEAD.  Popover must be open for the panel to
				// mount (it lives inside BranchPopover).
				setPopoverOpen(true);
				setCreateIntent({ base: branch.name });
				break;
			case "rename":
				pushToast(`重命名 ${branch.name}…`, "info", IconEdit);
				break;
			case "copy":
				navigator.clipboard?.writeText(branch.name);
				pushToast(`已复制 · ${branch.name}`, "success", IconCopy);
				break;
			case "terminal":
				pushToast(`已在终端中打开 · ${branch.name}`, "info", IconTerminal);
				break;
			case "delete":
				setConfirm({ branch, x: ctx.x, y: ctx.y });
				break;
			default:
				break;
		}
	};

	const confirmDelete = () => {
		if (!confirm) return;
		pushToast(`已删除分支 ${confirm.branch.name}`, "success", IconTrash);
		setConfirm(null);
	};

	const applyScenario = (s) => {
		setScenarioId(s.id);
		setPopoverOpen(s.open);
		if (s.ctxFor) {
			const branch = V3_LOCAL_BRANCHES.find((b) => b.name === s.ctxFor);
			if (branch) {
				// Anchor context menu somewhere sensible on the sidebar area.
				const sidebar = document.querySelector(".rs");
				if (sidebar) {
					const rect = sidebar.getBoundingClientRect();
					setCtx({
						branch,
						isCurrent: branch.name === currentBranch,
						x: rect.left - 260, // to the left of the sidebar so both are visible
						y: rect.top + 200,
					});
				} else {
					setCtx({
						branch,
						isCurrent: branch.name === currentBranch,
						x: window.innerWidth / 2,
						y: window.innerHeight / 2,
					});
				}
			}
		} else {
			setCtx(null);
		}
	};

	// Render scenario strip buttons into the header slot.  Keep the root as a
	// ref so we don't unmount / remount on every state change (that races with
	// the parent render and yields a React warning about synchronous unmount).
	const scenarioRootRef = React.useRef(null);
	React.useEffect(() => {
		const host = document.getElementById("scenarioButtons");
		if (!host) return;
		if (!scenarioRootRef.current) {
			scenarioRootRef.current = ReactDOM.createRoot(host);
		}
		scenarioRootRef.current.render(
			<ScenarioStrip
				scenarios={V3_SCENARIOS}
				current={scenarioId}
				onPick={applyScenario}
			/>,
		);
	}, [scenarioId, currentBranch]);

	return (
		<>
			<EditorPane current={currentBranch} />
			<Sidebar
				current={currentBranch}
				popoverOpen={popoverOpen}
				setPopoverOpen={setPopoverOpen}
				query={query}
				setQuery={setQuery}
				locals={locals}
				remotes={remotes}
				onSwitch={(row) => {
					if (row.isRemoteOnly) {
						pushToast(`已检出远程分支 ${row.name}`, "success", IconCloud);
					} else {
						pushToast(`已切换到 ${row.name}`, "success", IconCheck);
					}
					setCurrentBranch(row.name);
					setPopoverOpen(false);
				}}
				onRowContext={openContextMenu}
				onFetch={() => {
					setFetchSpinning(true);
					setTimeout(() => {
						setFetchSpinning(false);
						pushToast("已 fetch 全部远程分支", "success", IconRefresh);
					}, 900);
				}}
				onNewBranch={({ name, base, checkout }) => {
					pushToast(`已从 ${base} 新建 ${name}`, "success", IconPlus);
					if (checkout) {
						setCurrentBranch(name);
						setPopoverOpen(false);
					}
				}}
				createIntent={createIntent}
				onCreateHandled={() => setCreateIntent(null)}
				fetchSpinning={fetchSpinning}
				files={V3_CHANGED_FILES}
			/>
			{ctx ? (
				<ContextMenu
					branch={ctx.branch}
					isCurrent={ctx.isCurrent}
					x={ctx.x}
					y={ctx.y}
					onClose={() => setCtx(null)}
					onAction={doAction}
				/>
			) : null}
			{confirm ? (
				<DeleteConfirm
					branch={confirm.branch}
					x={confirm.x}
					y={confirm.y}
					onCancel={() => setConfirm(null)}
					onConfirm={confirmDelete}
				/>
			) : null}
			<ToastLayer
				toasts={toasts}
				dismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
			/>
		</>
	);
}

// Theme switch (same behaviour as v2)
const themeSwitch = document.getElementById("themeSwitch");
themeSwitch?.addEventListener("click", (event) => {
	const target = event.target.closest("[data-theme]");
	if (!target) return;
	const theme = target.getAttribute("data-theme");
	document.documentElement.setAttribute("data-theme", theme);
	themeSwitch.querySelectorAll("button").forEach((b) => {
		b.classList.toggle("is-active", b === target);
	});
});

ReactDOM.createRoot(document.getElementById("scene")).render(<App />);
