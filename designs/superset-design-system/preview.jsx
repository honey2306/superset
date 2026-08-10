// Superset Design System — single-page preview (Dracula only).
// Everything reads tokens from styles.css; components read components.css.

function Card({ name, kind, children, wide }) {
	return (
		<div className={`ds-card${wide ? " wide" : ""}`}>
			<header>
				<span>{name}</span>
				{kind ? <span className="kind">{kind}</span> : null}
			</header>
			<div className="body">{children}</div>
		</div>
	);
}

function Section({ title, hint, children, gridClass }) {
	return (
		<section className="ds-section">
			<div className="ds-section-head">
				<h2 className="ds-section-title">{title}</h2>
				{hint ? <span className="ds-section-hint">{hint}</span> : null}
			</div>
			<div className={`ds-grid ${gridClass || ""}`}>{children}</div>
		</section>
	);
}

/* ---------------------------------------- Foundations */

const COLOR_TOKENS = [
	{ v: "--page-bg", note: "app background" },
	{ v: "--surface", note: "cards / editors" },
	{ v: "--surface-elev", note: "raised inputs" },
	{ v: "--surface-sunk", note: "popovers / menus" },
	{ v: "--fg", note: "primary text" },
	{ v: "--fg-mute", note: "secondary text" },
	{ v: "--fg-faint", note: "tertiary / captions" },
	{ v: "--line", note: "hairline dividers" },
	{ v: "--line-strong", note: "strong dividers, buttons" },
	{ v: "--accent", note: "brand pink" },
	{ v: "--accent-2", note: "brand purple" },
	{ v: "--accent-tint", note: "current-branch bg" },
	{ v: "--success", note: "add / push OK" },
	{ v: "--warning", note: "modified / behind" },
	{ v: "--danger", note: "delete / errors" },
	{ v: "--info", note: "informational" },
];

function ColorSwatchCard({ tokens, name }) {
	return (
		<Card name={name} kind="tokens">
			<div style={{ width: "100%" }}>
				{tokens.map((t) => (
					<div key={t.v} className="swatch-row">
						<span
							className="swatch-chip"
							style={{ background: `var(${t.v})` }}
						/>
						<span className="swatch-name">{t.v}</span>
						<span className="swatch-val">{t.note}</span>
					</div>
				))}
			</div>
		</Card>
	);
}

function TypeCard() {
	return (
		<Card name="Type · scale" kind="css var">
			<div className="type-specimen">
				<div className="type-display">Aa 分支管理</div>
				<span className="meta">--fs-36 · --fw-semibold · --ls-title</span>
			</div>
			<div className="type-specimen">
				<div className="type-heading">Section title</div>
				<span className="meta">--fs-22 · --fw-semibold</span>
			</div>
			<div className="type-specimen">
				<div className="type-body">
					Body copy — the quick brown fox 敏捷的棕色狐狸
				</div>
				<span className="meta">--fs-13 · --lh-body 1.55</span>
			</div>
			<div className="type-specimen">
				<div className="type-mono">feat/kro-suite · ↑ 3 ↓ 0</div>
				<span className="meta">--font-mono · --fs-12</span>
			</div>
		</Card>
	);
}

function SpacingCard() {
	const steps = [
		["--s-2", 4],
		["--s-3", 6],
		["--s-4", 8],
		["--s-6", 12],
		["--s-8", 16],
		["--s-12", 24],
		["--s-16", 32],
		["--s-24", 48],
	];
	return (
		<Card name="Spacing · 4-based">
			<div className="space-strip">
				{steps.map(([tok, px]) => (
					<div key={tok} className="step">
						<div className="bar" style={{ width: px }} />
						<span>{px}</span>
						<span style={{ opacity: 0.5 }}>{tok}</span>
					</div>
				))}
			</div>
		</Card>
	);
}

function RadiusCard() {
	const steps = [
		["--r-2", 4],
		["--r-3", 6],
		["--r-4", 8],
		["--r-5", 10],
		["--r-6", 12],
		["--r-7", 14],
	];
	return (
		<Card name="Radius">
			<div className="radius-strip">
				{steps.map(([tok, px]) => (
					<div key={tok}>
						<div className="box" style={{ borderRadius: `var(${tok})` }} />
						<div className="lbl">{px}px</div>
					</div>
				))}
			</div>
		</Card>
	);
}

function ShadowCard() {
	return (
		<Card name="Shadow · elevation">
			<div className="stack-3" style={{ width: "100%" }}>
				<div className="shadow-slab" style={{ boxShadow: "var(--shadow-1)" }} />
				<div className="shadow-slab" style={{ boxShadow: "var(--shadow-2)" }} />
				<div className="shadow-slab" style={{ boxShadow: "var(--shadow-3)" }} />
				<div className="shadow-slab" style={{ boxShadow: "var(--shadow-4)" }} />
			</div>
		</Card>
	);
}

function MotionCard() {
	return (
		<Card name="Motion · durations & easings">
			<div className="motion-strip">
				<div className="row">
					<span>--dur-instant</span>
					<code>80ms</code>
				</div>
				<div className="row">
					<span>--dur-quick</span>
					<code>120ms</code>
				</div>
				<div className="row">
					<span>--dur-base</span>
					<code>180ms</code>
				</div>
				<div className="row">
					<span>--dur-slow</span>
					<code>260ms</code>
				</div>
				<div className="row">
					<span>--ease-standard</span>
					<code>0.2, 0.7, 0.3, 1</code>
				</div>
				<div className="row">
					<span>--ease-out</span>
					<code>0.16, 1, 0.3, 1</code>
				</div>
			</div>
		</Card>
	);
}

/* ---------------------------------------- Components */

function PillCard() {
	return (
		<Card name="Pill · branch trigger">
			<button className="pill">
				<IconBranch className="glyph" />
				<span className="label">feat/kro-suite</span>
				<IconChevron className="chev" />
			</button>
			<button className="pill" aria-expanded="true">
				<IconBranch className="glyph" />
				<span className="label">main</span>
				<IconChevron className="chev" style={{ transform: "rotate(180deg)" }} />
			</button>
		</Card>
	);
}

function ButtonCard() {
	return (
		<Card name="Button" kind=".btn">
			<div className="stack-4" style={{ width: "100%" }}>
				<div className="row-4">
					<button className="btn primary">
						<IconGitPush /> Commit & Push
					</button>
					<button className="btn">Cancel</button>
					<button className="btn ghost">Skip</button>
					<button className="btn danger">
						<IconTrash /> Delete
					</button>
				</div>
				<div className="row-4">
					<button className="btn sm primary">Save</button>
					<button className="btn sm">Reset</button>
					<button className="btn sm" disabled>
						Loading…
					</button>
				</div>
			</div>
		</Card>
	);
}

function IconButtonCard() {
	return (
		<Card name="Icon button · row" kind=".icon-btn">
			<button className="icon-btn" title="Refresh">
				<IconRefresh />
			</button>
			<button className="icon-btn" title="Sort">
				<IconSort />
			</button>
			<button className="icon-btn" title="More">
				<IconMoreH />
			</button>
			<button className="icon-btn" title="Maximize">
				<IconMax />
			</button>
			<button className="icon-btn" title="Close">
				<IconX />
			</button>
		</Card>
	);
}

function ChipCard() {
	return (
		<Card name="Chip · file summary">
			<span className="chip">
				<span className="dot mod" /> 4 modified
			</span>
			<span className="chip">
				<span className="dot add" /> 2 added
			</span>
			<span className="chip">
				<span className="dot del" /> 1 deleted
			</span>
		</Card>
	);
}

function BadgeCard() {
	return (
		<Card name="Badge · file status">
			<span className="badge add">A</span>
			<span className="badge mod">M</span>
			<span className="badge del">D</span>
			<span className="badge">R</span>
			<span className="badge pill">当前</span>
		</Card>
	);
}

function TagCard() {
	return (
		<Card name="Tag · ahead / behind">
			<span className="tag up">↑ 3</span>
			<span className="tag down">↓ 12</span>
			<span className="tag">origin</span>
			<span className="kbd">⌘K</span>
			<span className="kbd">Esc</span>
		</Card>
	);
}

function InputCard() {
	return (
		<Card name="Input · search + text" kind=".input">
			<div className="stack-3" style={{ width: "100%" }}>
				<label className="input">
					<IconSearch className="glyph" />
					<input
						placeholder="Jump to branch, or type to create…"
						defaultValue="feat/"
					/>
				</label>
				<label className="input transparent">
					<IconBranch className="glyph" />
					<input placeholder="feat/new-branch" />
				</label>
			</div>
		</Card>
	);
}

function CheckboxCard() {
	const [on, setOn] = React.useState(true);
	const [switchOn, setSwitchOn] = React.useState(true);
	return (
		<Card name="Checkbox · switch">
			<label className="check">
				<input
					type="checkbox"
					checked={on}
					onChange={(e) => setOn(e.target.checked)}
				/>
				<span className="box" aria-hidden />
				创建后切换到此分支
			</label>
			<label className="check">
				<input type="checkbox" />
				<span className="box" aria-hidden />
				Include tags
			</label>
			<span
				className="switch"
				role="switch"
				aria-checked={switchOn}
				onClick={() => setSwitchOn((v) => !v)}
			/>
		</Card>
	);
}

function SegmentedCard() {
	const [tab, setTab] = React.useState("Local");
	return (
		<Card name="Segmented control">
			<div className="segmented">
				{["Local", "Remote", "Tag"].map((t) => (
					<button
						key={t}
						className={t === tab ? "is-active" : ""}
						onClick={() => setTab(t)}
					>
						{t}
					</button>
				))}
			</div>
		</Card>
	);
}

function TabsCard() {
	const [tab, setTab] = React.useState("Changes");
	return (
		<Card name="Tabs · Changes / Files" wide>
			<div className="tabs" style={{ width: "100%" }}>
				{[
					{ id: "Changes", icon: IconChanges },
					{ id: "Files", icon: IconFile },
					{ id: "History", icon: IconRefresh },
				].map((t) => {
					const Icon = t.icon;
					return (
						<button
							key={t.id}
							className={`tab${t.id === tab ? " is-active" : ""}`}
							onClick={() => setTab(t.id)}
						>
							<Icon /> {t.id}
						</button>
					);
				})}
			</div>
		</Card>
	);
}

function PopoverCard() {
	return (
		<Card name="Popover · branch list" wide>
			<div className="popover" style={{ margin: "6px 0" }}>
				<div className="popover-head">
					<IconSearch className="glyph" />
					<input
						placeholder="Jump to branch, or type to create…"
						defaultValue=""
					/>
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
					<div className="popover-row">
						<IconBranch className="glyph" />
						<span className="name">bugfix/reap-legacy-orphans</span>
						<span className="tag down">↓ 2</span>
						<span className="end">2d</span>
					</div>
					<div className="popover-row is-focused">
						<IconBranch className="glyph" />
						<span className="name">main</span>
						<span className="tag down">↓ 12</span>
						<span className="end">1w</span>
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
		</Card>
	);
}

function ContextMenuCard() {
	return (
		<Card name="Context menu · branch ops" wide>
			<div className="menu" style={{ margin: "6px 0" }}>
				<div className="menu-heading">
					<IconBranch className="glyph" />
					<span>feat/browser-use</span>
				</div>
				<div className="menu-sep" />
				<div className="menu-group">分支操作</div>
				<button className="menu-item">
					<IconArrowRight className="glyph" />
					<span className="label">切换到此分支</span>
				</button>
				<button className="menu-item">
					<IconMerge className="glyph" />
					<span className="label">合并到 当前分支</span>
				</button>
				<button className="menu-item">
					<IconPlus className="glyph" />
					<span className="label">从此分支新建…</span>
				</button>
				<div className="menu-group">同步</div>
				<button className="menu-item">
					<IconGitPull className="glyph" />
					<span className="label">拉取</span>
					<span className="tag down">↓ 2</span>
				</button>
				<button className="menu-item">
					<IconGitPush className="glyph" />
					<span className="label">推送</span>
					<span className="tag up">↑ 3</span>
				</button>
				<div className="menu-group">管理</div>
				<button className="menu-item">
					<IconEdit className="glyph" />
					<span className="label">重命名…</span>
				</button>
				<button className="menu-item">
					<IconCopy className="glyph" />
					<span className="label">复制分支名</span>
					<span className="kbd">⌘C</span>
				</button>
				<div className="menu-sep" />
				<button className="menu-item is-danger">
					<IconTrash className="glyph" />
					<span className="label">删除分支</span>
				</button>
			</div>
		</Card>
	);
}

function ConfirmCard() {
	return (
		<Card name="Confirm · destructive" wide>
			<div className="confirm" style={{ margin: "6px auto" }}>
				<div className="icon">
					<IconAlert />
				</div>
				<h3 className="title">删除分支</h3>
				<p className="body">
					这会从本地永久删除分支 <code>bugfix/reap-legacy-orphans</code>
					,其中还有 <code>2</code> 个未推送的提交。此操作无法在应用内撤销。
				</p>
				<div className="actions">
					<button className="btn">取消</button>
					<button className="btn danger">删除</button>
				</div>
			</div>
		</Card>
	);
}

function ToastCard() {
	return (
		<Card name="Toast · action feedback" wide>
			<div className="stack-3">
				<div className="toast success">
					<IconCheck className="glyph" />
					<span>已切换到 feat/kro-suite</span>
				</div>
				<div className="toast">
					<IconGitPull className="glyph" />
					<span>已拉取 main · 12 commits</span>
				</div>
				<div className="toast warn">
					<IconAlert className="glyph" />
					<span>推送时发现冲突,请先 pull</span>
				</div>
				<div className="toast error">
					<IconX className="glyph" />
					<span>fetch 失败:无法连接 origin</span>
				</div>
			</div>
		</Card>
	);
}

function FileRowCard() {
	return (
		<Card name="File row · Changes" wide>
			<div className="stack-3" style={{ width: "100%" }}>
				<div className="file-row">
					<IconFile className="glyph" />
					<span className="dir">apps/desktop/src/renderer/</span>
					<span>MainView.tsx</span>
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
					<span className="dir">packages/ui/src/</span>
					<span>popover.tsx</span>
					<span className="badge del">D</span>
				</div>
			</div>
		</Card>
	);
}

/* ---------------------------------------- UI kit — Changes panel */

function ChangesKit() {
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
					<span className="dir">packages/ui/src/</span>
					<span>popover.tsx</span>
					<span className="badge del">D</span>
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

/* ---------------------------------------- App */

function App() {
	return (
		<main className="ds-page">
			<header className="ds-head">
				<div className="titles">
					<span className="ds-eyebrow">Superset · Design System · v0.1</span>
					<h1 className="ds-title">
						Superset Design System
						<span className="sub"> — 从 Branch Menu v3 抽出来的一整套语言</span>
					</h1>
					<p className="ds-desc">
						单主题(Dracula),先把 tokens 和常用组件铺出来。粉色只做 tint / dot /
						ring,主体交给中性色。所有组件从{" "}
						<code className="mono">tokens/*.css</code> 派生,换主题只需要覆盖
						tokens。
					</p>
				</div>
				<div className="row-3">
					<span className="badge pill">Dracula</span>
					<span className="chip">
						<span className="dot" /> single theme
					</span>
				</div>
			</header>

			<Section title="Foundations · Colors">
				<ColorSwatchCard
					name="Semantic tokens"
					tokens={COLOR_TOKENS.slice(0, 8)}
				/>
				<ColorSwatchCard
					name="Accent & status"
					tokens={COLOR_TOKENS.slice(8)}
				/>
			</Section>

			<Section title="Foundations · Type / Space / Radius / Shadow / Motion">
				<TypeCard />
				<SpacingCard />
				<RadiusCard />
				<ShadowCard />
				<MotionCard />
			</Section>

			<Section title="Components · Primitives">
				<PillCard />
				<ButtonCard />
				<IconButtonCard />
				<ChipCard />
				<BadgeCard />
				<TagCard />
				<InputCard />
				<CheckboxCard />
				<SegmentedCard />
				<TabsCard />
				<FileRowCard />
			</Section>

			<Section title="Components · Overlays">
				<PopoverCard />
				<ContextMenuCard />
				<ConfirmCard />
				<ToastCard />
			</Section>

			<Section title="UI kit · Changes panel (composed)">
				<div
					style={{
						gridColumn: "1 / -1",
						display: "flex",
						justifyContent: "center",
					}}
				>
					<ChangesKit />
				</div>
			</Section>
		</main>
	);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
