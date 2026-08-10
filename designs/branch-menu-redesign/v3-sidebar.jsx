// Faked Superset right-sidebar shell + the extended B popover.
// The popover is anchored to the pill button and lives inside .rs so its
// position matches the real product.  Right-click on any branch row fires
// props.onContext which the App wires up to open a ContextMenu.

function BranchPill({ branch, onClick, isOpen }) {
	return (
		<button
			className="bm-trigger"
			onClick={onClick}
			style={
				isOpen
					? {
							background: "var(--v2-hover)",
							borderColor: "var(--v2-line-strong)",
						}
					: undefined
			}
			data-open={isOpen ? "true" : undefined}
		>
			<IconBranch className="glyph" />
			<span className="name">{branch}</span>
			<IconChevron
				className="chev"
				style={{
					transform: isOpen ? "rotate(180deg)" : undefined,
					transition: "transform 0.15s",
				}}
			/>
		</button>
	);
}

const BRANCH_NAME_RE = /^[A-Za-z0-9._/-][A-Za-z0-9._/@+-]*$/;

// The "create branch" panel is opened with a base ref. Two entry points:
//   - popover header "+ 新建"        →  base = current HEAD
//   - context menu "从此分支新建…"    →  base = the right-clicked ref
// Same as IntelliJ/WebStorm: the base is decided by the entry point and is
// shown for reference but not editable inside the panel.
function BranchPopover({
	current,
	query,
	setQuery,
	locals,
	remotes,
	onSwitch,
	onRowContext,
	onFetch,
	onNewBranch,
	fetchSpinning,
	createIntent, // { base } | null — set by parent to open the panel from ctx menu
	onCreateHandled, // callback fired once the intent has been consumed
}) {
	// Focused index for keyboard nav — supports Enter to switch.
	const [focused, setFocused] = React.useState(-1);
	// Inline "create branch" panel state.  When null the panel is hidden.
	const [creating, setCreating] = React.useState(null); // { base } | null
	const [newName, setNewName] = React.useState("");
	const [newError, setNewError] = React.useState(null);
	const [checkoutAfter, setCheckoutAfter] = React.useState(true);
	const newInputRef = React.useRef(null);

	// Parent-driven open (right-click → "从此分支新建").
	React.useEffect(() => {
		if (createIntent) {
			setCreating({ base: createIntent.base });
			onCreateHandled?.();
		}
	}, [createIntent, onCreateHandled]);

	// Focus + prefilanel opens.
	React.useEffect(() => {
		if (creating) {
			if (!newName && query.trim()) setNewName(query.trim());
			setTimeout(() => newInputRef.current?.focus(), 0);
		} else {
			setNewName("");
			setNewError(null);
			setCheckoutAfter(true);
		}
	}, [creating]);

	const localNames = React.useMemo(
		() => new Set(locals.map((b) => b.name)),
		[locals],
	);
	const submitNewBranch = () => {
		if (!creating) return;
		const name = newName.trim();
		if (!BRANCH_NAME_RE.test(name)) {
			setNewError("分支名不合法。只允许字母、数字、`._/-`");
			return;
		}
		if (localNames.has(name)) {
			setNewError(`分支 "${name}" 已存在`);
			return;
		}
		onNewBranch({ name, base: creating.base, checkout: checkoutAfter });
		setCreating(null);
	};
	const rows = [...locals, ...remotes];
	const inputRef = React.useRef(null);
	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);
	const onKeyDown = (e) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setFocused((i) => Math.min(rows.length - 1, i + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setFocused((i) => Math.max(0, i - 1));
		} else if (e.key === "Enter") {
			const row = rows[focused >= 0 ? focused : 0];
			if (row) onSwitch(row);
		}
	};

	return (
		<div className="bm-anchor">
			<div className="bm vb" onKeyDown={onKeyDown}>
				<div className="b-head">
					<IconSearch className="icon" />
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="跳转、或输入名称新建…"
						spellCheck={false}
					/>
				</div>

				<div className="b-group">
					<span>本地分支 · {locals.length}</span>
					<button
						className={`action${creating ? " is-on" : ""}`}
						onClick={() => setCreating((v) => (v ? null : { base: current }))}
						type="button"
					>
						<IconPlus /> 新建
					</button>
				</div>

				{creating ? (
					<div className="b-create">
						<div className="b-create-base">
							<span className="k">Base</span>
							<span className="ref">
								<IconBranch className="glyph" />
								{creating.base}
								{creating.base === current ? (
									<span className="badge">当前</span>
								) : null}
							</span>
						</div>
						<div className="b-create-row">
							<IconBranch className="glyph" />
							<input
								ref={newInputRef}
								value={newName}
								onChange={(e) => {
									setNewName(e.target.value);
									setNewError(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										submitNewBranch();
									} else if (e.key === "Escape") {
										e.preventDefault();
										e.stopPropagation();
										setCreating(null);
									}
								}}
								placeholder="feat/new-branch"
								spellCheck={false}
								autoComplete="off"
							/>
						</div>
						<div className="b-create-foot">
							<label className="check">
								<input
									type="checkbox"
									checked={checkoutAfter}
									onChange={(e) => setCheckoutAfter(e.target.checked)}
								/>
								<span className="box" aria-hidden />
								创建后切换到此分支
							</label>
							<div className="foot-actions">
								<button
									type="button"
									className="ghost"
									onClick={() => setCreating(null)}
								>
									取消
								</button>
								<button
									type="button"
									className="primary"
									onClick={submitNewBranch}
									disabled={!newName.trim()}
								>
									新建
								</button>
							</div>
						</div>
						{newError ? <div className="b-create-err">{newError}</div> : null}
					</div>
				) : null}
				<div className="b-list">
					{locals.map((b, i) => {
						const isCurrent = b.name === current;
						const ab = [];
						if (b.ahead) ab.push(`↑ ${b.ahead}`);
						if (b.behind) ab.push(`↓ ${b.behind}`);
						return (
							<div
								key={b.name}
								className={
									"b-row" +
									(isCurrent ? " is-current" : "") +
									(focused === i ? " is-focused" : "")
								}
								onClick={() => (!isCurrent ? onSwitch(b) : null)}
								onContextMenu={(e) => {
									e.preventDefault();
									onRowContext(b, isCurrent, e.clientX, e.clientY);
								}}
								onMouseEnter={() => setFocused(i)}
							>
								<IconBranch className="glyph" />
								<span className="name">{b.name}</span>
								{ab.length ? (
									<span className="tag">{ab.join("  ")}</span>
								) : null}
								<span className="end">
									{isCurrent ? (
										<IconCheck className="check" size={12} />
									) : (
										b.relative || ""
									)}
								</span>
							</div>
						);
					})}
				</div>

				{remotes.length > 0 ? (
					<>
						<div className="b-sep" />
						<div className="b-group">
							<span>远程 · {remotes.length}</span>
							<button className="action" onClick={onFetch} type="button">
								<IconRefresh className={fetchSpinning ? "spin" : ""} /> Fetch
							</button>
						</div>
						<div className="b-list">
							{remotes.map((b, i) => (
								<div
									key={b.name}
									className={
										"b-row" +
										(focused === locals.length + i ? " is-focused" : "")
									}
									onClick={() =>
										onSwitch({ ...b, hasRemote: true, isRemoteOnly: true })
									}
									onContextMenu={(e) => {
										e.preventDefault();
										onRowContext(
											{ ...b, hasRemote: true, isRemoteOnly: true },
											false,
											e.clientX,
											e.clientY,
										);
									}}
									onMouseEnter={() => setFocused(locals.length + i)}
								>
									<IconCloud className="glyph" />
									<span className="name">{b.name}</span>
									<span className="end">origin</span>
								</div>
							))}
						</div>
					</>
				) : null}

				<div className="b-hint">
					<span>右键任意分支查看操作</span>
				</div>
			</div>
		</div>
	);
}

function Sidebar({
	current,
	popoverOpen,
	setPopoverOpen,
	query,
	setQuery,
	locals,
	remotes,
	onSwitch,
	onRowContext,
	onFetch,
	onNewBranch,
	fetchSpinning,
	files,
	createIntent,
	onCreateHandled,
}) {
	// Close popover on outside click / Esc.
	const popRootRef = React.useRef(null);
	React.useEffect(() => {
		if (!popoverOpen) return;
		const onDown = (e) => {
			if (!popRootRef.current) return;
			if (!popRootRef.current.contains(e.target)) setPopoverOpen(false);
		};
		const onKey = (e) => {
			if (e.key === "Escape") setPopoverOpen(false);
		};
		document.addEventListener("mousedown", onDown, true);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("mousedown", onDown, true);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [popoverOpen, setPopoverOpen]);

	const counts = files.reduce(
		(acc, f) => {
			if (f.status === "A") acc.add++;
			else if (f.status === "M") acc.mod++;
			else if (f.status === "D") acc.del++;
			return acc;
		},
		{ add: 0, mod: 0, del: 0 },
	);

	return (
		<div className="rs" ref={popRootRef}>
			<div className="rs-tabs">
				<button className="rs-tab is-active">
					<IconChanges size={14} /> Changes
				</button>
				<button className="rs-tab">
					<IconFile /> Files
				</button>
				<div className="rs-tabs-spacer" />
				<button className="rs-icon" title="Maximize">
					<IconMax />
				</button>
				<button className="rs-icon" title="Close">
					<IconX />
				</button>
			</div>

			<div className="rs-branch-bar">
				<BranchPill
					branch={current}
					isOpen={popoverOpen}
					onClick={() => setPopoverOpen((v) => !v)}
				/>
				<div style={{ marginLeft: "auto" }} />
				<button className="rs-icon" title="Sort">
					<IconSort />
				</button>
				<button className="rs-icon" title="Refresh">
					<IconRefresh className={fetchSpinning ? "spin" : ""} />
				</button>
				{popoverOpen ? (
					<BranchPopover
						current={current}
						query={query}
						setQuery={setQuery}
						locals={locals}
						remotes={remotes}
						onSwitch={onSwitch}
						onRowContext={onRowContext}
						onFetch={onFetch}
						onNewBranch={onNewBranch}
						fetchSpinning={fetchSpinning}
						createIntent={createIntent}
						onCreateHandled={onCreateHandled}
					/>
				) : null}
			</div>

			<div className="rs-summary-bar">
				<span className="chip">
					<span className="dot mod" /> {counts.mod} modified
				</span>
				<span className="chip">
					<span className="dot add" /> {counts.add} added
				</span>
				{counts.del ? (
					<span className="chip">
						<span className="dot del" /> {counts.del} deleted
					</span>
				) : null}
				<div className="rs-actions">
					<button className="rs-icon" title="More">
						<IconMoreH />
					</button>
				</div>
			</div>

			<div className="rs-files">
				{files.map((f) => (
					<div key={f.dir + f.file} className="rs-file">
						<IconFile />
						<span className="path-dir">{f.dir}</span>
						<span>{f.file}</span>
						<span
							className={
								"badge" +
								(f.status === "A" ? " add" : f.status === "M" ? " mod" : " del")
							}
						>
							{f.status}
						</span>
					</div>
				))}
			</div>

			<div className="rs-commit">
				<textarea
					placeholder="Summary (required)…"
					defaultValue="feat(branch-menu): move ops into right-click menu"
				/>
				<div className="rs-commit-actions">
					<span className="rs-hint">
						On <b>{current}</b> · 9 files
					</span>
					<button className="rs-commit-btn">
						<IconGitPush /> Commit &amp; Push
					</button>
				</div>
			</div>
		</div>
	);
}

Object.assign(window, { Sidebar, BranchPill, BranchPopover });
