const { Icon } = window.SupersetDesignSystem_91a6da;

const wsbProjects = [
	{
		id: "superset",
		name: "superset",
		thumb: "S",
		count: 8,
		sections: [
			{
				id: "active",
				name: "Active",
				open: true,
				rows: [
					{
						id: "w1",
						title: "Kro suite refactor",
						branch: "feat/kro-suite",
						status: "running",
						stats: { add: 128, del: 42 },
						hotkey: "⌘1",
						pr: { label: "#4213", state: "open" },
						active: true,
					},
					{
						id: "w2",
						title: "Reap legacy orphans",
						branch: "bugfix/reap-legacy-orphans",
						status: "ok",
						stats: { add: 34, del: 208 },
						hotkey: "⌘2",
						pr: { label: "#4198", state: "merged" },
					},
					{
						id: "w3",
						title: "Browser extension bridge",
						branch: "feat/browser-extension-bridge",
						status: "warn",
						stats: null,
						hotkey: "⌘3",
						pr: { label: "draft", state: "draft" },
					},
				],
			},
			{
				id: "backlog",
				name: "Backlog",
				open: false,
				rows: [
					{
						id: "w4",
						title: "Electron final polish",
						branch: "electron-final",
						status: "err",
						hotkey: "⌘4",
					},
				],
			},
		],
	},
	{
		id: "kro",
		name: "kro-cli",
		thumb: "K",
		count: 3,
		sections: [],
	},
];

const wsbPorts = [
	{
		name: "kro-suite",
		ports: [
			{ port: 3000, label: "web" },
			{ port: 5881, label: "api" },
			{ port: 5433, label: "db" },
		],
	},
	{ name: "reap-legacy", ports: [{ port: 3001, label: "web" }] },
];

function StatusIcon({ status }) {
	const color =
		status === "running"
			? "var(--accent)"
			: status === "ok"
				? "var(--success)"
				: status === "warn"
					? "var(--warning)"
					: status === "err"
						? "var(--danger)"
						: "var(--fg-faint)";
	if (status === "running") {
		return (
			<span
				className="spinner accent"
				style={{ width: 12, height: 12 }}
			/>
		);
	}
	return (
		<span
			style={{
				width: 8,
				height: 8,
				borderRadius: "999px",
				background: color,
				display: "inline-block",
			}}
		/>
	);
}

function WsbRow({ row }) {
	return (
		<div className={`wsb-row${row.active ? " is-active" : ""}`}>
			<div className="head">
				<span className="icon">
					<StatusIcon status={row.status} />
				</span>
				<span className="title">{row.title}</span>
				{row.stats ? (
					<span className="stats">
						<span className="add">+{row.stats.add}</span>
						<span className="del">−{row.stats.del}</span>
					</span>
				) : null}
				{row.hotkey ? <span className="kbd">{row.hotkey}</span> : null}
				{row.active ? null : (
					<span className="close">
						<Icon name="x" size={12} />
					</span>
				)}
			</div>
			<div className="sub">
				<span className="branch">{row.branch}</span>
				{row.pr ? (
					<span className={`pr-badge ${row.pr.state}`}>
						<Icon name="pr" size={9} /> {row.pr.label}
					</span>
				) : null}
			</div>
		</div>
	);
}

function WorkspaceSidebarKit() {
	return (
		<div className="wsb">
			<div className="wsb-head">
				<button className="wsb-nav">
					<Icon name="workflow" className="glyph" size={14} /> Automations
				</button>
				<button className="wsb-nav">
					<Icon name="listTodo" className="glyph" size={14} /> Todos
					<span className="dot" />
				</button>
				<button className="wsb-nav">
					<Icon name="clock" className="glyph" size={14} /> Temporary
					workspace
				</button>
			</div>
			<div className="wsb-body">
				{wsbProjects.map((p) => (
					<div className="wsb-project" key={p.id}>
						<div className="wsb-project-head">
							<span className="thumb">{p.thumb}</span>
							<span className="name">{p.name}</span>
							<span className="count">({p.count})</span>
							<Icon name="plus" size={12} style={{ color: "var(--fg-faint)" }} />
						</div>
						{p.sections.map((s) => (
							<React.Fragment key={s.id}>
								<div
									className={`wsb-section-head${
										s.open ? " is-open" : ""
									}`}
								>
									<Icon name="chevron" className="chev" size={8} />
									{s.name} <span style={{ color: "var(--fg-mute)" }}>({s.rows.length})</span>
								</div>
								{s.open
									? s.rows.map((r) => <WsbRow row={r} key={r.id} />)
									: null}
							</React.Fragment>
						))}
					</div>
				))}
			</div>
			<div className="wsb-ports">
				<div className="wsb-ports-head">
					<Icon name="chevron" className="glyph" size={8} style={{ transform: "rotate(90deg)" }} />
					<Icon name="radioTower" className="glyph" size={11} /> Ports
					<span className="count" style={{ marginLeft: "auto" }}>4</span>
				</div>
				{wsbPorts.map((g) => (
					<div className="wsb-port-group" key={g.name}>
						<div className="lbl">{g.name}</div>
						<div className="ports">
							{g.ports.map((p) => (
								<span className="wsb-port-badge" key={p.port}>
									<Icon name="radioTower" className="glyph" size={9} />
									{p.port} {p.label}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
			<div className="wsb-foot">
				<button className="wsb-add-repo">
					<Icon name="plus" className="glyph" size={12} /> Add repository
				</button>
				<span className="upd-pill ready" title="Install v1.14.1">
					<span className="dot" />↑ update
				</span>
			</div>
		</div>
	);
}

const wsbRoot = ReactDOM.createRoot(document.getElementById("root"));
wsbRoot.render(<WorkspaceSidebarKit />);
