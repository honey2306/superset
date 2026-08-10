// Three restrained variants of the branch menu popover.
// Each variant renders: trigger context row → the popover card → caption.
// Data + local search state are lifted per-variant so filtering feels real.

const BRANCHES = [
	"feat/kro-suite",
	"backup/pre-filter-kro-suite",
	"backup/pre-filter-ui-v2",
	"backup/pre-merge-ui-v2-into-kro-suite",
	"bugfix/duplicate-delete-dialogs",
	"bugfix/reap-legacy-orphans",
	"electron-final",
	"feat/alt_updater",
	"feat/browser-extension-bridge",
	"feat/browser-use",
	"main",
	"chore/deps-2026-08",
];

const REMOTES = [
	"feat/mcp-cursor-connector",
	"feat/terminal-picker",
	"release/2026-08",
	"fix/pty-flush-timing",
];

const RELATIVE = {
	"feat/kro-suite": "just now",
	"backup/pre-filter-kro-suite": "2h ago",
	"backup/pre-filter-ui-v2": "5h",
	"backup/pre-merge-ui-v2-into-kro-suite": "yesterday",
	"bugfix/duplicate-delete-dialogs": "yesterday",
	"bugfix/reap-legacy-orphans": "2d",
	"electron-final": "3d",
	"feat/alt_updater": "3d",
	"feat/browser-extension-bridge": "4d",
	"feat/browser-use": "5d",
	main: "1w",
	"chore/deps-2026-08": "1w",
};

const AHEAD_BEHIND = {
	"feat/kro-suite": "↑ 3",
	main: "↑ 1  ↓ 12",
	"electron-final": "↓ 4",
};

// -------------------------------------------------------------
// Shared trigger pill — visible above every artboard for context.
// -------------------------------------------------------------
function TriggerPill({ branch = "feat/kro-suite" }) {
	return (
		<button className="bm-trigger">
			<IconBranch className="glyph" />
			<span className="name">{branch}</span>
			<IconChevron className="chev" />
		</button>
	);
}

function ContextRow({ branch }) {
	return (
		<div className="bm-context">
			<span className="tab">
				<IconBranch size={11} /> Changes
			</span>
			<span style={{ opacity: 0.35 }}>·</span>
			<TriggerPill branch={branch} />
		</div>
	);
}

// -------------------------------------------------------------
// Variant A — Editorial hairline
// -------------------------------------------------------------
function VariantA() {
	const [q, setQ] = React.useState("");
	const current = "feat/kro-suite";
	const local = BRANCHES.filter((b) =>
		b.toLowerCase().includes(q.toLowerCase()),
	);
	return (
		<div className="bm-frame">
			<ContextRow branch={current} />
			<div className="bm va">
				<div className="a-head">
					<label className="a-search">
						<IconSearch className="icon" />
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="搜索分支"
							spellCheck={false}
						/>
					</label>
					<button className="a-icon-btn" title="Fetch remote">
						<IconRefresh />
					</button>
					<button className="a-new">
						<IconPlus /> 新建
					</button>
				</div>

				<div className="a-group">
					<span>Local</span>
					<span className="count">{local.length}</span>
				</div>
				<div className="a-list">
					{local.map((b) => {
						const isCurrent = b === current;
						return (
							<div key={b} className={`a-row${isCurrent ? " is-current" : ""}`}>
								<span className="dot" />
								<span className="name">{b}</span>
								<span className="meta">{RELATIVE[b] || ""}</span>
							</div>
						);
					})}
				</div>
			</div>
			<div className="caption">A · Editorial hairline</div>
		</div>
	);
}

// -------------------------------------------------------------
// Variant B — Command surface
// -------------------------------------------------------------
function VariantB() {
	const [q, setQ] = React.useState("");
	const current = "feat/kro-suite";
	const local = BRANCHES.filter((b) =>
		b.toLowerCase().includes(q.toLowerCase()),
	);
	const remotes = REMOTES.filter((b) =>
		b.toLowerCase().includes(q.toLowerCase()),
	);
	return (
		<div className="bm-frame">
			<ContextRow branch={current} />
			<div className="bm vb">
				<div className="b-head">
					<IconSearch className="icon" />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="跳转分支、或输入名称新建…"
						spellCheck={false}
					/>
					<span className="kbd">⌘K</span>
				</div>

				<div className="b-group">
					<span>本地分支 · {local.length}</span>
					<button className="action">
						<IconPlus /> 新建
					</button>
				</div>
				<div className="b-list">
					{local.map((b) => {
						const isCurrent = b === current;
						return (
							<div key={b} className={`b-row${isCurrent ? " is-current" : ""}`}>
								<IconBranch className="glyph" />
								<span className="name">{b}</span>
								{AHEAD_BEHIND[b] ? (
									<span className="tag">{AHEAD_BEHIND[b]}</span>
								) : null}
								<span className="end">
									{isCurrent ? (
										<IconCheck className="check" size={12} />
									) : (
										RELATIVE[b] || ""
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
							<button className="action">
								<IconRefresh /> Fetch
							</button>
						</div>
						<div className="b-list">
							{remotes.map((b) => (
								<div key={b} className="b-row">
									<IconCloud className="glyph" />
									<span className="name">{b}</span>
									<span className="end">origin</span>
								</div>
							))}
						</div>
					</>
				) : null}
			</div>
			<div className="caption">B · Command surface</div>
		</div>
	);
}

// -------------------------------------------------------------
// Variant C — Silent card
// -------------------------------------------------------------
function VariantC() {
	const [q, setQ] = React.useState("");
	const [filter, setFilter] = React.useState("all"); // all | local | remote
	const current = "feat/kro-suite";
	const localFiltered = BRANCHES.filter((b) =>
		b.toLowerCase().includes(q.toLowerCase()),
	);
	const remoteFiltered = REMOTES.filter((b) =>
		b.toLowerCase().includes(q.toLowerCase()),
	);
	const showLocal = filter !== "remote";
	const showRemote = filter !== "local";

	return (
		<div className="bm-frame">
			<ContextRow branch={current} />
			<div className="bm vc">
				<div className="c-head">
					<label className="c-search">
						<IconSearch className="icon" />
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder="搜索分支"
							spellCheck={false}
						/>
						<span className="kbd">/</span>
					</label>
					<div className="c-tools">
						<div className="c-tools-l">
							<button
								className={`c-tool${filter === "all" ? " is-on" : ""}`}
								onClick={() => setFilter("all")}
							>
								全部
							</button>
							<button
								className={`c-tool${filter === "local" ? " is-on" : ""}`}
								onClick={() => setFilter("local")}
							>
								本地
							</button>
							<button
								className={`c-tool${filter === "remote" ? " is-on" : ""}`}
								onClick={() => setFilter("remote")}
							>
								远程
							</button>
							<button className="c-tool" title="Fetch remote">
								<IconRefresh />
							</button>
						</div>
						<button className="c-new">
							<IconPlus /> 新建
						</button>
					</div>
				</div>
				<div className="c-list">
					{showLocal ? (
						<>
							<div className="c-group">
								<span className="label">Local · {localFiltered.length}</span>
								<span className="rule" />
							</div>
							{localFiltered.map((b) => {
								const isCurrent = b === current;
								return (
									<div
										key={b}
										className={`c-row${isCurrent ? " is-current" : ""}`}
									>
										<IconBranch className="glyph" />
										<span className="name">{b}</span>
										{isCurrent ? (
											<span className="end-chip">on</span>
										) : (
											<span className="end-meta">{RELATIVE[b] || ""}</span>
										)}
									</div>
								);
							})}
						</>
					) : null}

					{showRemote ? (
						<>
							<div className="c-group">
								<span className="label">Remote · {remoteFiltered.length}</span>
								<span className="rule" />
							</div>
							{remoteFiltered.map((b) => (
								<div key={b} className="c-row">
									<IconCloud className="glyph" />
									<span className="name">{b}</span>
									<span className="end-meta">origin</span>
								</div>
							))}
						</>
					) : null}
				</div>
			</div>
			<div className="caption">C · Silent card</div>
		</div>
	);
}

Object.assign(window, {
	BRANCHES,
	REMOTES,
	TriggerPill,
	ContextRow,
	VariantA,
	VariantB,
	VariantC,
});
