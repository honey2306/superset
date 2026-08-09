// Right-click context menu for a branch row.
// Layout: heading (branch name) → group Actions → group Sync → group Manage
// → danger.  Items disable themselves based on branch state (current branch,
// no remote, no diverged commits, etc.).

function buildMenuSections(branch, isCurrent) {
	const hasRemote = branch.hasRemote !== false;
	const ahead = branch.ahead || 0;
	const behind = branch.behind || 0;

	return [
		{
			id: "actions",
			label: "分支操作",
			items: [
				{
					id: "switch",
					label: "切换到此分支",
					icon: IconArrowRight,
					disabled: isCurrent,
					disabledReason: isCurrent ? "已在此分支" : null,
				},
				{
					id: "merge",
					label: `合并到 当前分支`,
					icon: IconMerge,
					disabled: isCurrent,
					disabledReason: isCurrent ? "无法合并到自身" : null,
				},
				{
					id: "checkout-new",
					label: "从此分支新建…",
					icon: IconPlus,
				},
			],
		},
		{
			id: "sync",
			label: "同步",
			items: [
				{
					id: "pull",
					label: "拉取",
					icon: IconGitPull,
					// Show behind count as a monospace badge on the right so it lines up with the "↑ N" tag we use inside the popover list.
					badge: behind > 0 ? { dir: "down", n: behind } : null,
					disabled: !hasRemote,
					disabledReason: !hasRemote ? "此分支无远程跟踪" : null,
				},
				{
					id: "push",
					label: hasRemote ? "推送" : "推送到 origin",
					badge: ahead > 0 ? { dir: "up", n: ahead } : null,
					icon: IconGitPush,
				},
				{
					id: "fetch",
					label: "拉取远程",
					icon: IconRefresh,
				},
			],
		},
		{
			id: "manage",
			label: "管理",
			items: [
				{
					id: "rename",
					label: "重命名…",
					icon: IconEdit,
				},
				{
					id: "copy",
					label: "复制分支名",
					icon: IconCopy,
				},
				{
					id: "terminal",
					label: "在终端中打开…",
					icon: IconTerminal,
				},
			],
		},
		{
			id: "danger",
			label: "",
			separator: true,
			items: [
				{
					id: "delete",
					label: "删除分支",
					icon: IconTrash,
					danger: true,
					disabled: isCurrent,
					disabledReason: isCurrent ? "不能删除当前分支" : null,
				},
			],
		},
	];
}

function ContextMenu({ branch, isCurrent, x, y, onClose, onAction }) {
	const menuRef = React.useRef(null);
	const [pos, setPos] = React.useState({ left: x, top: y });

	// Clamp menu to viewport after mount so it doesn't clip off-screen.
	React.useLayoutEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let left = x;
		let top = y;
		if (left + rect.width + 8 > vw) left = vw - rect.width - 8;
		if (top + rect.height + 8 > vh) top = Math.max(8, y - rect.height);
		setPos({ left, top });
	}, [x, y]);

	// Close on outside click / Esc.
	React.useEffect(() => {
		const onDown = (e) => {
			if (!menuRef.current) return;
			if (!menuRef.current.contains(e.target)) onClose();
		};
		const onKey = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", onDown, true);
		document.addEventListener("contextmenu", onDown, true);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("mousedown", onDown, true);
			document.removeEventListener("contextmenu", onDown, true);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [onClose]);

	const sections = buildMenuSections(branch, isCurrent);

	return (
		<div
			ref={menuRef}
			className="ctx-menu"
			style={{ left: pos.left, top: pos.top }}
			role="menu"
			onContextMenu={(e) => e.preventDefault()}
		>
			<div className="ctx-heading">
				<IconBranch className="glyph" />
				<span title={branch.name}>{branch.name}</span>
				{isCurrent ? <span className="badge">当前</span> : null}
			</div>
			<div className="ctx-sep" />
			{sections.map((section, si) => (
				<React.Fragment key={section.id}>
					{section.separator && si > 0 ? <div className="ctx-sep" /> : null}
					{section.label ? (
						<div className="ctx-group">{section.label}</div>
					) : null}
					{section.items.map((item) => {
						const Icon = item.icon;
						return (
							<button
								type="button"
								key={item.id}
								className={
									"ctx-item" +
									(item.disabled ? " is-disabled" : "") +
									(item.danger ? " is-danger" : "")
								}
								onClick={() => {
									if (item.disabled) return;
									onAction(item, branch);
								}}
								title={
									item.disabled ? item.disabledReason || undefined : undefined
								}
							>
								{Icon ? <Icon className="glyph" size={13} /> : null}
								<span className="label">{item.label}</span>
								{item.badge ? (
									<span
										className={`tag${item.badge.dir === "up" ? " up" : " down"}`}
									>
										{item.badge.dir === "up" ? "↑" : "↓"} {item.badge.n}
									</span>
								) : null}
							</button>
						);
					})}
				</React.Fragment>
			))}
		</div>
	);
}

function DeleteConfirm({ branch, x, y, onCancel, onConfirm }) {
	const ref = React.useRef(null);
	const [pos, setPos] = React.useState({ left: x, top: y });
	React.useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const left = Math.min(x, vw - rect.width - 8);
		const top = Math.min(y, vh - rect.height - 8);
		setPos({ left, top });
	}, [x, y]);
	React.useEffect(() => {
		const onKey = (e) => {
			if (e.key === "Escape") onCancel();
			if (e.key === "Enter") onConfirm();
		};
		document.addEventListener("keydown", onKey, true);
		return () => document.removeEventListener("keydown", onKey, true);
	}, [onCancel, onConfirm]);
	return (
		<div
			ref={ref}
			className="confirm-card"
			style={{ left: pos.left, top: pos.top }}
		>
			<div className="icon-wrap">
				<IconAlert />
			</div>
			<h3 className="title">删除分支</h3>
			<p className="body">
				这会从本地永久删除分支 <code>{branch.name}</code>
				{branch.ahead ? (
					<>
						{" "}
						,其中还有 <code>{branch.ahead}</code> 个未推送的提交
					</>
				) : null}
				。此操作无法在应用内撤销。
			</p>
			<div className="actions">
				<button className="btn" onClick={onCancel}>
					取消
				</button>
				<button className="btn danger" onClick={onConfirm}>
					删除
				</button>
			</div>
		</div>
	);
}

Object.assign(window, { ContextMenu, DeleteConfirm });
