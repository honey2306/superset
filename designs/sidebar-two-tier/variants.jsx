/* 最终稿（A · 安静）：两层结构（组 + 项目）+ 图标导航排 + 合并后的单
   workspace 行；「置顶进行中」是可叠加的附加开关；右键承载一切次级操作。 */

const { Icon } = window.SupersetDesignSystem_91a6da;

/* ------------------------------------------------------------- 状态标记 --- */

function StatusMark({ state: markState }) {
	if (markState === "running") return <span className="st-run" />;
	if (markState === "ok") return <span className="st st-ok" />;
	if (markState === "warn") return <span className="st st-warn" />;
	if (markState === "err") return <span className="st st-err" />;
	return null;
}

/* --------------------------------------------------------------- 共享块 --- */

function SidebarHead({ onToggleRail, isRail }) {
	return (
		<div className="sb-head">
			{!isRail && <span className="sb-mark">Superset</span>}
			<button
				type="button"
				className="sb-icon-btn"
				style={{ marginLeft: "auto" }}
				onClick={onToggleRail}
				title={isRail ? "展开侧边栏" : "收起侧边栏"}
			>
				<Glyph name="sidebarToggle" size={15} />
			</button>
		</div>
	);
}

function NavRow({ isRail, current, onPick }) {
	return (
		<div className="sb-nav">
			{NAV_ITEMS.map((item) => (
				<button
					key={item.id}
					type="button"
					title={item.label}
					className={`sb-icon-btn${current === item.id ? " is-on" : ""}`}
					onClick={() => onPick(item.id)}
				>
					<Glyph name={item.glyph} size={15} />
					{item.alert && <span className="sb-nav-alert" />}
				</button>
			))}
			{!isRail && <span style={{ flex: 1 }} />}
		</div>
	);
}

function GroupHead({ group, isOpen, onToggle, onAdd }) {
	return (
		<div className="sb-ghead">
			<button
				type="button"
				className="sb-gtoggle"
				aria-expanded={isOpen}
				aria-label={`折叠 ${group.label}`}
				onClick={onToggle}
			>
				<Icon name="chevron" size={11} />
			</button>
			<span className="sb-ghead-label">{group.label}</span>
			{group.projects.length > 1 && (
				<span className="sb-gcount">{group.projects.length}</span>
			)}
			<button
				type="button"
				className="sb-gadd"
				aria-label={`在 ${group.label} 新建项目`}
				onClick={onAdd}
			>
				<Icon name="plus" size={12} />
			</button>
		</div>
	);
}

function PortsStrip({ isOpen, onToggle }) {
	const total = PORT_GROUPS.reduce((sum, g) => sum + g.ports.length, 0);
	return (
		<div className="sb-ports">
			<button
				type="button"
				className="sb-ports-head"
				aria-expanded={isOpen}
				onClick={onToggle}
			>
				<Glyph name="ports" size={12} />
				端口
				<span className="sb-ports-count">{total}</span>
			</button>
			{isOpen &&
				PORT_GROUPS.flatMap((g) =>
					g.ports.map((p) => (
						<div className="sb-port-row" key={`${g.id}-${p.port}`}>
							<span className="sb-port-num">:{p.port}</span>
							<span className="sb-port-label">{p.label}</span>
							<span className="sb-port-project">{g.project}</span>
						</div>
					)),
				)}
		</div>
	);
}

function SidebarFooter({ isRail }) {
	if (isRail) {
		return (
			<div className="sb-foot">
				<button type="button" className="sb-icon-btn" title="添加仓库">
					<Glyph name="folderPlus" size={15} />
				</button>
				<button type="button" className="sb-icon-btn" title="设置">
					<Glyph name="settings" size={15} />
				</button>
				<span className="sb-avatar">吴</span>
			</div>
		);
	}
	return (
		<div className="sb-foot">
			<button type="button" className="sb-foot-btn">
				<Glyph name="folderPlus" size={14} />
				添加仓库
			</button>
			<span style={{ flex: 1 }} />
			<button type="button" className="sb-icon-btn" title="设置">
				<Glyph name="settings" size={15} />
			</button>
			<span className="sb-avatar">吴</span>
		</div>
	);
}

/* ================================================== 组渲染机器（共享） ==== */
/* A / B 共用同一套「组 → 行」渲染，唯一差别是传进来的 Row。
   「置顶进行中」开启时，有活动的项目被真的移进顶部「进行中」组——
   它是叠加在普通模式上的开关，不是第三种模式。 */

const LIVE_STATES = new Set(["running", "warn", "err"]);

function splitLive(groups) {
	const live = [];
	const rest = groups
		.map((group) => {
			const kept = group.projects.filter((p) => {
				if (LIVE_STATES.has(p.state)) {
					live.push(p);
					return false;
				}
				return true;
			});
			return { ...group, projects: kept };
		})
		.filter((group) => group.projects.length > 0);
	return { live, rest };
}

function GroupBlock({ group, Row, extraClass = "", ...props }) {
	const { openGroups, onToggleGroup, showMulti } = props;
	const isLive = group.id === "__live";
	const isOpen = openGroups[group.id] !== false;
	return (
		<div className={`sb-group${isOpen ? " is-open" : ""}${extraClass}`}>
			<GroupHead
				group={group}
				isOpen={isOpen}
				onToggle={() => onToggleGroup(group.id)}
				onAdd={() => {}}
			/>
			{isOpen && (
				<div className="sb-glist">
					{group.projects.map((projectItem) => {
						const sub = buildRows(projectItem, showMulti);
						return (
							<div key={projectItem.id}>
								<Row item={projectItem} isLive={isLive} {...props} />
								{!sub.merged && (
									<div className="sb-children">
										{sub.children.map((child) => (
											<Row
												key={child.id}
												item={child}
												isChild
												isLive={isLive}
												{...props}
											/>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function makeList(Row) {
	return function List(props) {
		const { showLive } = props;
		const { live, rest } = showLive
			? splitLive(PROJECT_GROUPS)
			: { live: [], rest: PROJECT_GROUPS };
		return (
			<>
				{live.length > 0 && (
					<GroupBlock
						key="__live"
						group={{ id: "__live", label: "进行中", projects: live }}
						Row={Row}
						extraClass=" is-live"
						{...props}
					/>
				)}
				{rest.map((group) => (
					<GroupBlock key={group.id} group={group} Row={Row} {...props} />
				))}
			</>
		);
	};
}

/* ============================================================= 变体 A ==== */
/* 安静：全灰阶、零数字。branch 常驻在最弱一档灰阶，hover / 当前行提亮。
   diff 与 PR 只属于「进行中」置顶组——平时不渲染。 */

function QuietRow({ item, isChild, isLive, activeId, onPick, onMenu }) {
	const isActive = item.id === activeId;
	return (
		<div
			role="button"
			tabIndex={0}
			className={[
				"sb-row",
				isChild ? "is-child" : "",
				isActive ? "is-active" : "",
				item.unread ? "is-unread" : "",
			]
				.filter(Boolean)
				.join(" ")}
			onClick={() => onPick(item.id)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onPick(item.id);
				}
			}}
			onContextMenu={(e) => onMenu(e, item)}
		>
			<span className="sb-lane">
				<StatusMark state={item.state} />
			</span>
			<span className="sb-name">{item.name}</span>
			<span className="sb-branch">{item.branch}</span>
			{/* 平时不渲染 diff / PR；「进行中」组里它们是重点信息 */}
			{isLive && item.diff && (
				<span className="sb-diff">
					<span className="add">+{item.diff.add}</span>
					<span className="del">−{item.diff.del}</span>
				</span>
			)}
			{isLive && item.pr && (
				<span className={`sb-pr ${item.pr.state}`}>
					<Glyph name="pr" size={9} />
					{item.pr.num}
				</span>
			)}
			{item.unread && <span className="sb-unread-dot" />}
			{item.hotkey && <span className="sb-hotkey">{item.hotkey}</span>}
		</div>
	);
}

const QuietList = makeList(QuietRow);

/* --------------------------------------------------------------- rail ---- */

/* `name.slice(0, 2)` is what the shipped app does, and it turns agent-fabric /
   agent-fabric-web / agent-fabric-docs into three identical "ag" tiles. Initial
   of each hyphen segment keeps repo-style names apart: AF / AFW / AFD. */
function railInitials(projectName) {
	const parts = projectName.split(/[-_.]/).filter(Boolean);
	if (parts.length === 1) {
		return projectName.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
	}
	return parts
		.slice(0, 3)
		.map((part) => part[0].toUpperCase())
		.join("");
}

function RailView({ activeId, onPick, onMenu }) {
	const railRef = React.useRef(null);

	/* A 56px rail scrolls, so the current project has to be brought into view —
	   otherwise the only state that matters can sit below the fold. */
	React.useEffect(() => {
		const tile = railRef.current?.querySelector(".sb-rail-item.is-active");
		tile?.scrollIntoView({ block: "nearest" });
	}, [activeId]);

	return (
		<div ref={railRef}>
			{PROJECT_GROUPS.map((group, gi) => (
				<React.Fragment key={group.id}>
					{gi > 0 && <div className="sb-rail-sep" />}
					{group.projects.map((projectItem) => {
						const mark = railInitials(projectItem.name);
						return (
							<div
								key={projectItem.id}
								role="button"
								tabIndex={0}
								title={`${group.label} / ${projectItem.name} · ${projectItem.branch}`}
								className={[
									"sb-rail-item",
									projectItem.id === activeId ? "is-active" : "",
									mark.length > 2 ? "is-long" : "",
								]
									.filter(Boolean)
									.join(" ")}
								onClick={() => onPick(projectItem.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onPick(projectItem.id);
									}
								}}
								onContextMenu={(e) => onMenu(e, projectItem)}
							>
								{mark}
								<StatusMark state={projectItem.state} />
								{projectItem.unread && <span className="sb-rail-unread" />}
							</div>
						);
					})}
				</React.Fragment>
			))}
		</div>
	);
}

const VARIANTS = {
	quiet: {
		key: "quiet",
		label: "A · 安静",
		className: "v-quiet",
		List: QuietList,
		note: "全灰阶、零数字：名字 + 状态点 + 分支。branch 常驻在最弱一档灰阶——信息在，安静也在。",
	},
};

Object.assign(window, {
	StatusMark,
	SidebarHead,
	NavRow,
	GroupHead,
	PortsStrip,
	SidebarFooter,
	RailView,
	railInitials,
	VARIANTS,
});
