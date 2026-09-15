/* App shell: window frame + variant switcher + state toggles + context menu.
   All shared state lives here and flows down as props. */

const { Icon: DsIcon } = window.SupersetDesignSystem_91a6da;

function ContextMenuLayer({ menuState, onDismiss }) {
	React.useEffect(() => {
		if (!menuState) return;
		const away = () => onDismiss();
		const esc = (e) => {
			if (e.key === "Escape") onDismiss();
		};
		window.addEventListener("mousedown", away);
		window.addEventListener("keydown", esc);
		return () => {
			window.removeEventListener("mousedown", away);
			window.removeEventListener("keydown", esc);
		};
	}, [menuState, onDismiss]);

	if (!menuState) return null;
	const { x, y, item } = menuState;
	const style = {
		left: Math.min(x, window.innerWidth - 210),
		top: Math.min(y, window.innerHeight - 300),
	};
	return (
		<div className="ctx" style={style} onMouseDown={(e) => e.stopPropagation()}>
			<div className="ctx-head">
				{item.name} · {item.branch}
			</div>
			<button type="button" className="ctx-item">
				<DsIcon name="plus" size={13} />
				新建 workspace
				<span className="ctx-kbd">⌘N</span>
			</button>
			<button type="button" className="ctx-item">
				<DsIcon name="branch" size={13} />
				切换分支…
			</button>
			<div className="ctx-sep" />
			<button type="button" className="ctx-item">
				<DsIcon name="edit" size={13} />
				重命名
			</button>
			<button type="button" className="ctx-item">
				<DsIcon name="terminal" size={13} />
				在编辑器中打开
			</button>
			<button type="button" className="ctx-item">
				<DsIcon name="copy" size={13} />
				复制路径
			</button>
			<div className="ctx-sep" />
			<button type="button" className="ctx-item danger">
				<DsIcon name="x" size={13} />
				关闭项目
			</button>
		</div>
	);
}

function Sidebar({
	variant,
	isRail,
	activeId,
	onPick,
	openGroups,
	onToggleGroup,
	showMulti,
	showLive,
	showPorts,
	onTogglePorts,
	onToggleRail,
	navCurrent,
	onNavPick,
	onMenu,
}) {
	const List = variant.List;
	return (
		<div className={`sb ${variant.className}${isRail ? " is-rail" : ""}`}>
			<SidebarHead isRail={isRail} onToggleRail={onToggleRail} />
			<NavRow isRail={isRail} current={navCurrent} onPick={onNavPick} />
			<div className="sb-scroll">
				{isRail ? (
					<RailView activeId={activeId} onPick={onPick} onMenu={onMenu} />
				) : (
					<List
						activeId={activeId}
						onPick={onPick}
						openGroups={openGroups}
						onToggleGroup={onToggleGroup}
						showMulti={showMulti}
						showLive={showLive}
						onMenu={onMenu}
					/>
				)}
			</div>
			{!isRail && <PortsStrip isOpen={showPorts} onToggle={onTogglePorts} />}
			<SidebarFooter isRail={isRail} />
		</div>
	);
}

function MainPane({ activeName }) {
	return (
		<div className="main">
			<div className="main-tabs">
				<span className="main-tab is-on">重新设计左侧栏 UI</span>
				<span className="main-tab">Terminal</span>
				<span className="main-tab">分析启动 acp 慢的原因</span>
			</div>
			<div className="main-body">
				<div className="main-ghost">
					<i style={{ width: "38%" }} />
					<i style={{ width: "92%" }} />
					<i style={{ width: "78%" }} />
					<i style={{ width: "85%" }} />
					<i style={{ width: "46%" }} />
				</div>
			</div>
			<div className="main-status">
				<span>connected</span>
				<span>host-service :5881</span>
				<span>{activeName}</span>
				<span style={{ marginLeft: "auto" }}>Opus 5 · 200k ctx</span>
			</div>
		</div>
	);
}

function App() {
	const [activeId, setActiveId] = React.useState("superset");
	const [openGroups, setOpenGroups] = React.useState({});
	const [showMulti, setShowMulti] = React.useState(false);
	const [showPorts, setShowPorts] = React.useState(false);
	const [showLive, setShowLive] = React.useState(false);
	const [isRail, setIsRail] = React.useState(false);
	const [navCurrent, setNavCurrent] = React.useState(null);
	const [menuState, setMenuState] = React.useState(null);

	const variant = VARIANTS.quiet;

	const handleMenu = React.useCallback((e, item) => {
		e.preventDefault();
		e.stopPropagation();
		setMenuState({ x: e.clientX, y: e.clientY, item });
	}, []);

	const toggleGroup = React.useCallback((id) => {
		setOpenGroups((prev) => ({ ...prev, [id]: prev[id] === false }));
	}, []);

	const handlePick = React.useCallback((id) => {
		setActiveId(id);
		setNavCurrent(null);
	}, []);

	const activeName =
		PROJECT_GROUPS.flatMap((g) => g.projects)
			.flatMap((p) => [p, ...(p.extraWorkspaces ?? [])])
			.find((p) => p.id === activeId)?.branch ?? "main";

	return (
		<>
			<div className="cbar">
				<span className="cbar-title">左侧栏重设计 · 最终稿</span>
				<button
					type="button"
					className="toggle"
					aria-pressed={showMulti}
					onClick={() => setShowMulti((s) => !s)}
				>
					<span className="dot" />
					多 workspace
				</button>
				<button
					type="button"
					className="toggle"
					aria-pressed={showPorts}
					onClick={() => setShowPorts((s) => !s)}
				>
					<span className="dot" />
					端口
				</button>
				<button
					type="button"
					className="toggle"
					aria-pressed={showLive}
					onClick={() => setShowLive((s) => !s)}
				>
					<span className="dot" />
					置顶进行中
				</button>
				<button
					type="button"
					className="toggle"
					aria-pressed={isRail}
					onClick={() => setIsRail((s) => !s)}
				>
					<span className="dot" />
					收起
				</button>
			</div>

			<div className="cbar" style={{ paddingTop: 6, paddingBottom: 6 }}>
				<span className="cbar-note">
					最终稿 · 安静：全灰阶、零数字——名字 + 状态点 + 分支，branch 常驻最弱灰阶
				</span>
				<span className="cbar-spacer" />
				<span className="cbar-note" style={{ textAlign: "right" }}>
					右键任意项目行 → 所有次级操作都在菜单里 ·「置顶进行中」= 叠加开关
				</span>
			</div>

			<div className="stage">
				<div className="win" data-screen-label={variant.label}>
					<div className="win-chrome">
						<span className="win-lights">
							<i />
							<i />
							<i />
						</span>
					</div>
					<div className="win-body">
						<Sidebar
							variant={variant}
							isRail={isRail}
							activeId={activeId}
							onPick={handlePick}
							openGroups={openGroups}
							onToggleGroup={toggleGroup}
							showMulti={showMulti}
							showLive={showLive}
							showPorts={showPorts}
							onTogglePorts={() => setShowPorts((s) => !s)}
							onToggleRail={() => setIsRail((s) => !s)}
							navCurrent={navCurrent}
							onNavPick={setNavCurrent}
							onMenu={handleMenu}
						/>
						<MainPane activeName={activeName} />
					</div>
				</div>
			</div>

			<ContextMenuLayer
				menuState={menuState}
				onDismiss={() => setMenuState(null)}
			/>
		</>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
