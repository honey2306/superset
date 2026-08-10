// The four variant renderers. All consume window.TODOS.
const { Badge, Button, Chip, Icon, IconButton, Kbd, Tag, Tabs } =
	window.SupersetDesignSystem_91a6da;

// ----------------------------------------------------------------------------
// Page header — original (kept for V2 / V3)
// ----------------------------------------------------------------------------
function PageHeader({ counts }) {
	return (
		<div
			style={{
				padding: "18px 24px 12px",
				borderBottom: "1px solid var(--line)",
				background: "var(--surface)",
			}}
		>
			<div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
				<div style={{ flex: 1, minWidth: 0 }}>
					<h1
						style={{
							fontFamily: "var(--font-display)",
							fontSize: "var(--fs-22)",
							fontWeight: "var(--fw-semibold)",
							letterSpacing: "var(--ls-title)",
							margin: 0,
						}}
					>
						待办
					</h1>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<StatCard label="已过期" value={counts.overdue} tone="danger" />
					<StatCard label="今天" value={counts.today} tone="warning" />
					<StatCard label="本周" value={counts.week} tone="info" />
					<StatCard label="以后" value={counts.later} tone="muted" />
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						alignSelf: "center",
					}}
				>
					<IconButton title="筛选">
						<Icon name="search" size={13} />
					</IconButton>
					<Button variant="primary" size="sm">
						<Icon name="plus" size={12} /> 新建
					</Button>
				</div>
			</div>
		</div>
	);
}

// ----------------------------------------------------------------------------
// V1a — 极简单行:标题只占最小宽度,统计卡吃掉释放的空间,筛选变 IconButton
// ----------------------------------------------------------------------------
function HeaderV1a({ counts }) {
	return (
		<div
			style={{
				padding: "14px 24px",
				borderBottom: "1px solid var(--line)",
				background: "var(--surface)",
				display: "flex",
				alignItems: "center",
				gap: 20,
			}}
		>
			<h1
				style={{
					fontFamily: "var(--font-display)",
					fontSize: "var(--fs-18)",
					fontWeight: "var(--fw-semibold)",
					letterSpacing: "var(--ls-title)",
					margin: 0,
					flexShrink: 0,
				}}
			>
				待办
			</h1>
			<div
				style={{
					flex: 1,
					display: "flex",
					gap: 8,
					justifyContent: "flex-start",
				}}
			>
				<StatCard label="已过期" value={counts.overdue} tone="danger" />
				<StatCard label="今天" value={counts.today} tone="warning" />
				<StatCard label="本周" value={counts.week} tone="info" />
				<StatCard label="以后" value={counts.later} tone="muted" />
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
				<IconButton title="筛选">
					<Icon name="search" size={13} />
				</IconButton>
				<Button variant="primary" size="sm">
					<Icon name="plus" size={12} /> 新建
				</Button>
			</div>
		</div>
	);
}

// ----------------------------------------------------------------------------
// V1b — 双层:上层标题 + 主 CTA;下层统计条(横铺,更宽敞)+ 搜索输入
// ----------------------------------------------------------------------------
function HeaderV1b({ counts }) {
	return (
		<div
			style={{
				borderBottom: "1px solid var(--line)",
				background: "var(--surface)",
			}}
		>
			{/* 上层 */}
			<div
				style={{
					padding: "14px 24px 10px",
					display: "flex",
					alignItems: "center",
					gap: 16,
				}}
			>
				<h1
					style={{
						fontFamily: "var(--font-display)",
						fontSize: "var(--fs-22)",
						fontWeight: "var(--fw-semibold)",
						letterSpacing: "var(--ls-title)",
						margin: 0,
					}}
				>
					待办
				</h1>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "var(--fs-12)",
						color: "var(--fg-mute)",
					}}
				>
					{counts.overdue + counts.today + counts.week + counts.later} 条
				</span>
				<div style={{ flex: 1 }} />
				<Button variant="primary" size="sm">
					<Icon name="plus" size={12} /> 新建待办
				</Button>
			</div>
			{/* 下层 */}
			<div
				style={{
					padding: "0 24px 12px",
					display: "flex",
					alignItems: "center",
					gap: 12,
				}}
			>
				<div style={{ display: "flex", gap: 6 }}>
					<InlineStat label="已过期" value={counts.overdue} tone="danger" />
					<InlineStat label="今天" value={counts.today} tone="warning" />
					<InlineStat label="本周" value={counts.week} tone="info" />
					<InlineStat label="以后" value={counts.later} tone="muted" />
				</div>
				<div style={{ flex: 1 }} />
				<div
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: "4px 10px",
						borderRadius: "var(--r-pill)",
						background: "var(--surface-elev)",
						border: "1px solid var(--line)",
						fontSize: "var(--fs-12)",
						color: "var(--fg-mute)",
						minWidth: 200,
					}}
				>
					<Icon name="search" size={12} />
					<span>搜索待办</span>
					<span style={{ marginLeft: "auto" }}>
						<Kbd>⌘K</Kbd>
					</span>
				</div>
			</div>
		</div>
	);
}

// Inline pill stat used in V1b — 更瘦的统计条
function InlineStat({ label, value, tone }) {
	const toneColor = {
		danger: "var(--danger)",
		warning: "var(--warning)",
		info: "var(--info)",
		muted: "var(--fg)",
	}[tone ?? "muted"];
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 12px",
				borderRadius: "var(--r-pill)",
				background: "var(--surface-elev)",
				fontSize: "var(--fs-11)",
			}}
		>
			<span
				style={{
					width: 6,
					height: 6,
					borderRadius: "50%",
					background: toneColor,
				}}
			/>
			<span style={{ color: "var(--fg-mute)" }}>{label}</span>
			<span
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: "var(--fs-12)",
					color: "var(--fg)",
					fontWeight: "var(--fw-semibold)",
				}}
			>
				{value}
			</span>
		</span>
	);
}

// ----------------------------------------------------------------------------
// V1c — 数量融入标题:「待办 · 7」+ 统计 chip 条紧贴下面
// ----------------------------------------------------------------------------
function HeaderV1c({ counts }) {
	const total = counts.overdue + counts.today + counts.week + counts.later;
	return (
		<div
			style={{
				padding: "14px 24px 12px",
				borderBottom: "1px solid var(--line)",
				background: "var(--surface)",
				display: "flex",
				alignItems: "center",
				gap: 20,
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 6,
					flexShrink: 0,
				}}
			>
				<h1
					style={{
						fontFamily: "var(--font-display)",
						fontSize: "var(--fs-22)",
						fontWeight: "var(--fw-semibold)",
						letterSpacing: "var(--ls-title)",
						margin: 0,
						display: "flex",
						alignItems: "baseline",
						gap: 10,
					}}
				>
					待办
					<span
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "var(--fs-14)",
							color: "var(--fg-mute)",
							fontWeight: "var(--fw-regular)",
						}}
					>
						· {total}
					</span>
				</h1>
			</div>
			<div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
				<InlineStat label="已过期" value={counts.overdue} tone="danger" />
				<InlineStat label="今天" value={counts.today} tone="warning" />
				<InlineStat label="本周" value={counts.week} tone="info" />
				<InlineStat label="以后" value={counts.later} tone="muted" />
			</div>
			<div
				style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
			>
				<IconButton title="搜索">
					<Icon name="search" size={13} />
				</IconButton>
				<IconButton title="筛选">
					<Icon name="sort" size={13} />
				</IconButton>
				<Button variant="primary" size="sm">
					<Icon name="plus" size={12} /> 新建
				</Button>
			</div>
		</div>
	);
}

// ============================================================================
// V1 — Denser fixed list with buckets. Header 可切换。
// ============================================================================
function V1_FixedList({ todos, headerKind = "a" }) {
	const buckets = {
		overdue: [],
		today: [],
		week: [],
		later: [],
	};
	for (const t of todos) {
		const s = statusOf(t);
		if (s === "failed") buckets.overdue.push(t);
		else if (buckets[s]) buckets[s].push(t);
	}
	const bucketList = [
		{ key: "overdue", label: "已过期", tone: "var(--danger)" },
		{ key: "today", label: "今天", tone: "var(--warning)" },
		{ key: "week", label: "本周", tone: "var(--info)" },
		{ key: "later", label: "以后", tone: "var(--fg-mute)" },
	];
	const counts = {
		overdue: buckets.overdue.length,
		today: buckets.today.length,
		week: buckets.week.length,
		later: buckets.later.length,
	};

	const Header =
		headerKind === "a"
			? HeaderV1a
			: headerKind === "b"
				? HeaderV1b
				: headerKind === "c"
					? HeaderV1c
					: PageHeader;

	return (
		<AppFrame sidebarActive="待办">
			<Header counts={counts} />
			<div style={{ flex: 1, overflow: "auto", background: "var(--page-bg)" }}>
				<div
					style={{
						padding: "16px 24px 24px",
						display: "flex",
						flexDirection: "column",
						gap: 20,
					}}
				>
					{bucketList.map((b) => {
						const items = buckets[b.key];
						if (items.length === 0) return null;
						return (
							<section key={b.key}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										marginBottom: 8,
										padding: "0 4px",
									}}
								>
									<span
										style={{
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: b.tone,
										}}
									/>
									<span
										style={{
											fontSize: "var(--fs-12)",
											fontWeight: "var(--fw-semibold)",
											letterSpacing: "var(--ls-caps)",
										}}
									>
										{b.label}
									</span>
									<span
										style={{
											fontFamily: "var(--font-mono)",
											fontSize: "var(--fs-11)",
											color: "var(--fg-mute)",
										}}
									>
										{items.length}
									</span>
								</div>
								<div
									style={{
										background: "var(--surface)",
										border: "1px solid var(--line)",
										borderRadius: "var(--r-4)",
										overflow: "hidden",
									}}
								>
									{items.map((t, i) => (
										<V1_Row key={t.id} t={t} last={i === items.length - 1} />
									))}
								</div>
							</section>
						);
					})}
				</div>
			</div>
		</AppFrame>
	);
}

function V1_Row({ t, last }) {
	const s = statusOf(t);
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "18px 1fr auto auto",
				alignItems: "center",
				gap: 12,
				padding: "12px 16px",
				borderBottom: last ? "none" : "1px solid var(--line)",
			}}
		>
			<span
				style={{
					display: "inline-block",
					width: 14,
					height: 14,
					borderRadius: "50%",
					border: "1.5px solid var(--line-strong)",
				}}
			/>
			<div
				style={{
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					gap: 4,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-medium)" }}
					>
						{t.title}
					</span>
					<ModePill mode={t.mode} />
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						color: "var(--fg-mute)",
						fontSize: "var(--fs-11)",
					}}
				>
					<span
						style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
					>
						<StatusDot status={s} size={6} />
						<span style={{ fontFamily: "var(--font-mono)" }}>
							{fmtDay(t.dueAt)} · {fmtTime(t.dueAt)}
						</span>
					</span>
					{t.project && <ProjectChip project={t.project} />}
					{t.agent && (
						<span
							style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
						>
							<Icon name="spark" size={11} />
							{t.agent}
						</span>
					)}
					{t.note && (
						<span
							style={{
								color: "var(--fg-faint)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								maxWidth: 260,
							}}
						>
							{t.note}
						</span>
					)}
					{t.error && (
						<span
							style={{
								color: "var(--danger)",
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
							}}
						>
							<Icon name="alert" size={11} />
							{t.error}
						</span>
					)}
				</div>
			</div>
			<span
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: "var(--fs-11)",
					color: "var(--fg-mute)",
				}}
			>
				{fmtRelative(t.dueAt)}
			</span>
			<div style={{ display: "flex", gap: 4 }}>
				{t.mode === "auto" && (
					<IconButton title="立即运行">
						<Icon name="push" size={13} />
					</IconButton>
				)}
				<IconButton title="完成">
					<Icon name="check" size={13} />
				</IconButton>
				<IconButton title="更多">
					<Icon name="moreH" size={13} />
				</IconButton>
			</div>
		</div>
	);
}

// ============================================================================
// V2 — Timeline with a persistent day rail
// ============================================================================
function V2_Timeline({ todos }) {
	const groups = new Map();
	for (const t of todos) {
		const key = t.dueAt.toDateString();
		if (!groups.has(key)) groups.set(key, { date: t.dueAt, items: [] });
		groups.get(key).items.push(t);
	}
	const sorted = Array.from(groups.values()).sort((a, b) => a.date - b.date);
	const counts = {
		overdue: todos.filter(
			(t) => statusOf(t) === "overdue" || statusOf(t) === "failed",
		).length,
		today: todos.filter((t) => statusOf(t) === "today").length,
		week: todos.filter((t) => statusOf(t) === "week").length,
		later: todos.filter((t) => statusOf(t) === "later").length,
	};

	return (
		<AppFrame sidebarActive="待办">
			<PageHeader counts={counts} />
			<div style={{ flex: 1, overflow: "auto", background: "var(--page-bg)" }}>
				<div style={{ padding: "16px 24px 24px", position: "relative" }}>
					{/* Rail */}
					<div
						style={{
							position: "absolute",
							left: 80,
							top: 24,
							bottom: 24,
							width: 1,
							background: "var(--line)",
						}}
					/>
					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						{sorted.map((g) => (
							<V2_Day
								key={g.date.toISOString()}
								date={g.date}
								items={g.items}
							/>
						))}
					</div>
				</div>
			</div>
		</AppFrame>
	);
}

function V2_Day({ date, items }) {
	const isPast =
		date < NOW &&
		!(
			date.getFullYear() === NOW.getFullYear() &&
			date.getMonth() === NOW.getMonth() &&
			date.getDate() === NOW.getDate()
		);
	const isToday =
		date.getFullYear() === NOW.getFullYear() &&
		date.getMonth() === NOW.getMonth() &&
		date.getDate() === NOW.getDate();
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "80px 1fr",
				gap: 24,
				alignItems: "flex-start",
			}}
		>
			<div
				style={{ textAlign: "right", paddingRight: 20, position: "relative" }}
			>
				<div
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "var(--fs-11)",
						color: isPast
							? "var(--danger)"
							: isToday
								? "var(--warning)"
								: "var(--fg-mute)",
						letterSpacing: "var(--ls-caps)",
						textTransform: "uppercase",
						fontWeight: "var(--fw-semibold)",
					}}
				>
					{fmtDay(date)}
				</div>
				<div
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "var(--fs-11)",
						color: "var(--fg-faint)",
					}}
				>
					{date.getMonth() + 1}/{date.getDate()}
				</div>
				{/* Bullet on the rail */}
				<span
					style={{
						position: "absolute",
						right: -5,
						top: 3,
						width: 9,
						height: 9,
						borderRadius: "50%",
						background: isPast
							? "var(--danger)"
							: isToday
								? "var(--warning)"
								: "var(--surface)",
						boxShadow: isToday
							? "0 0 0 3px color-mix(in oklch, var(--warning) 22%, transparent)"
							: "0 0 0 1.5px var(--line-strong)",
					}}
				/>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{items.map((t) => (
					<V2_Item key={t.id} t={t} />
				))}
			</div>
		</div>
	);
}

function V2_Item({ t }) {
	const s = statusOf(t);
	const isFailed = s === "failed";
	return (
		<div
			style={{
				background: "var(--surface)",
				border: `1px solid ${isFailed ? "color-mix(in oklch, var(--danger) 32%, var(--line))" : "var(--line)"}`,
				borderRadius: "var(--r-4)",
				padding: "10px 14px",
				display: "flex",
				alignItems: "center",
				gap: 12,
			}}
		>
			<span
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: "var(--fs-12)",
					color: "var(--fg-mute)",
					minWidth: 44,
				}}
			>
				{fmtTime(t.dueAt)}
			</span>
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					gap: 2,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-medium)" }}
					>
						{t.title}
					</span>
					<ModePill mode={t.mode} />
					{t.project && <ProjectChip project={t.project} />}
					{t.agent && (
						<span style={{ fontSize: "var(--fs-11)", color: "var(--fg-mute)" }}>
							· {t.agent}
						</span>
					)}
				</div>
				{(t.note || t.error) && (
					<div
						style={{
							fontSize: "var(--fs-11)",
							color: t.error ? "var(--danger)" : "var(--fg-faint)",
						}}
					>
						{t.error ?? t.note}
					</div>
				)}
			</div>
			<div style={{ display: "flex", gap: 4 }}>
				{t.mode === "auto" && (
					<IconButton title="立即运行">
						<Icon name="push" size={13} />
					</IconButton>
				)}
				<IconButton title="完成">
					<Icon name="check" size={13} />
				</IconButton>
			</div>
		</div>
	);
}

// ============================================================================
// V3 — Card grid
// ============================================================================
function V3_CardGrid({ todos }) {
	const counts = {
		overdue: todos.filter((t) => ["overdue", "failed"].includes(statusOf(t)))
			.length,
		today: todos.filter((t) => statusOf(t) === "today").length,
		week: todos.filter((t) => statusOf(t) === "week").length,
		later: todos.filter((t) => statusOf(t) === "later").length,
	};
	return (
		<AppFrame sidebarActive="待办">
			<PageHeader counts={counts} />
			<div style={{ flex: 1, overflow: "auto", background: "var(--page-bg)" }}>
				<div
					style={{
						padding: "16px 24px 24px",
						display: "grid",
						gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
						gap: 12,
					}}
				>
					{todos.map((t) => (
						<V3_Card key={t.id} t={t} />
					))}
				</div>
			</div>
		</AppFrame>
	);
}

function V3_Card({ t }) {
	const s = statusOf(t);
	const isFailed = s === "failed";
	const accentColor = {
		overdue: "var(--danger)",
		failed: "var(--danger)",
		today: "var(--warning)",
		week: "var(--info)",
		later: "var(--fg-mute)",
	}[s];
	return (
		<div
			style={{
				background: "var(--surface)",
				border: "1px solid var(--line)",
				borderRadius: "var(--r-4)",
				padding: 16,
				display: "flex",
				flexDirection: "column",
				gap: 10,
				position: "relative",
				overflow: "hidden",
			}}
		>
			{/* Accent stripe */}
			<span
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					bottom: 0,
					width: 3,
					background: accentColor,
				}}
			/>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginBottom: 2,
						}}
					>
						<StatusDot status={s} size={7} />
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "var(--fs-11)",
								color: "var(--fg-mute)",
								letterSpacing: "var(--ls-caps)",
							}}
						>
							{fmtDay(t.dueAt)} · {fmtTime(t.dueAt)}
						</span>
						<ModePill mode={t.mode} />
					</div>
					<div
						style={{
							fontSize: "var(--fs-14)",
							fontWeight: "var(--fw-semibold)",
							lineHeight: "var(--lh-snug)",
						}}
					>
						{t.title}
					</div>
				</div>
			</div>
			{t.note && (
				<div
					style={{
						fontSize: "var(--fs-12)",
						color: "var(--fg-mute)",
						lineHeight: "var(--lh-body)",
					}}
				>
					{t.note}
				</div>
			)}
			{isFailed && (
				<div
					style={{
						fontSize: "var(--fs-11)",
						color: "var(--danger)",
						display: "flex",
						alignItems: "center",
						gap: 4,
					}}
				>
					<Icon name="alert" size={11} />
					{t.error}
				</div>
			)}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					marginTop: "auto",
					paddingTop: 8,
					borderTop: "1px solid var(--line)",
				}}
			>
				<div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
					{t.project && <ProjectChip project={t.project} />}
					{t.agent && (
						<span
							style={{
								fontSize: "var(--fs-11)",
								color: "var(--fg-mute)",
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
							}}
						>
							<Icon name="spark" size={11} />
							{t.agent}
						</span>
					)}
				</div>
				<div style={{ display: "flex", gap: 4 }}>
					{t.mode === "auto" && (
						<IconButton title="立即运行">
							<Icon name="push" size={13} />
						</IconButton>
					)}
					<IconButton title="完成">
						<Icon name="check" size={13} />
					</IconButton>
					<IconButton title="更多">
						<Icon name="moreH" size={13} />
					</IconButton>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// V4 — Hero + dual pane
// ============================================================================
function V4_Hero({ todos }) {
	const upcoming = [...todos]
		.filter((t) => !["done"].includes(t.status))
		.sort((a, b) => a.dueAt - b.dueAt);
	const next = upcoming[0];
	const rest = upcoming.slice(1);
	const doneMock = [
		{
			id: "d1",
			title: "写完 M5 provisioning 回归清单",
			at: new Date("2026-08-09T07:20:00"),
		},
		{
			id: "d2",
			title: "推送 branch-menu-redesign v3",
			at: new Date("2026-08-08T21:05:00"),
		},
		{
			id: "d3",
			title: "跑 e2e:acp-daemon",
			at: new Date("2026-08-08T18:12:00"),
		},
	];

	return (
		<AppFrame sidebarActive="待办">
			{/* Compact page header, no stat cards (hero shows the important thing) */}
			<div
				style={{
					padding: "18px 24px 12px",
					borderBottom: "1px solid var(--line)",
					background: "var(--surface)",
					display: "flex",
					alignItems: "center",
					gap: 12,
				}}
			>
				<div style={{ flex: 1 }}>
					<div
						style={{
							fontSize: "var(--fs-11)",
							color: "var(--fg-mute)",
							letterSpacing: "var(--ls-eyebrow)",
							textTransform: "uppercase",
							marginBottom: 4,
						}}
					>
						Workspace / 待办
					</div>
					<h1
						style={{
							fontFamily: "var(--font-display)",
							fontSize: "var(--fs-22)",
							fontWeight: "var(--fw-semibold)",
							margin: 0,
						}}
					>
						待办
					</h1>
				</div>
				<Button size="sm">
					<Icon name="search" size={12} /> 筛选
				</Button>
				<Button variant="primary" size="sm">
					<Icon name="plus" size={12} /> 新建待办
				</Button>
			</div>

			<div style={{ flex: 1, overflow: "auto", background: "var(--page-bg)" }}>
				<div
					style={{
						padding: "16px 24px 24px",
						display: "flex",
						flexDirection: "column",
						gap: 16,
					}}
				>
					<V4_Hero_Card t={next} />
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1.35fr 1fr",
							gap: 16,
							minHeight: 0,
						}}
					>
						<V4_UpcomingList items={rest} />
						<V4_DoneRail items={doneMock} />
					</div>
				</div>
			</div>
		</AppFrame>
	);
}

function V4_Hero_Card({ t }) {
	const s = statusOf(t);
	const isOverdue = s === "overdue" || s === "failed";
	const accent = isOverdue ? "var(--danger)" : "var(--accent)";
	return (
		<div
			style={{
				background: "var(--surface-elev)",
				border: `1px solid ${isOverdue ? "color-mix(in oklch, var(--danger) 36%, var(--line))" : "color-mix(in oklch, var(--accent) 28%, var(--line))"}`,
				borderRadius: "var(--r-5)",
				padding: "18px 20px",
				display: "grid",
				gridTemplateColumns: "1fr auto",
				gap: 16,
				alignItems: "center",
				position: "relative",
				overflow: "hidden",
			}}
		>
			<span
				style={{
					position: "absolute",
					inset: 0,
					background: `radial-gradient(circle at 8% 50%, color-mix(in oklch, ${accent} 12%, transparent), transparent 50%)`,
					pointerEvents: "none",
				}}
			/>
			<div style={{ position: "relative", zIndex: 1 }}>
				<div
					style={{
						fontSize: "var(--fs-11)",
						color: isOverdue ? "var(--danger)" : "var(--accent)",
						fontFamily: "var(--font-mono)",
						letterSpacing: "var(--ls-caps)",
						textTransform: "uppercase",
						marginBottom: 6,
					}}
				>
					{isOverdue ? "已过期" : "下一条"} · {fmtRelative(t.dueAt)}
				</div>
				<div
					style={{
						fontFamily: "var(--font-display)",
						fontSize: "var(--fs-22)",
						fontWeight: "var(--fw-semibold)",
						lineHeight: "var(--lh-snug)",
						letterSpacing: "var(--ls-title)",
						marginBottom: 8,
					}}
				>
					{t.title}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						color: "var(--fg-mute)",
						fontSize: "var(--fs-12)",
					}}
				>
					<span style={{ fontFamily: "var(--font-mono)" }}>
						{fmtDay(t.dueAt)} · {fmtTime(t.dueAt)}
					</span>
					<ModePill mode={t.mode} />
					{t.project && <ProjectChip project={t.project} />}
					{t.agent && (
						<span
							style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
						>
							<Icon name="spark" size={11} />
							{t.agent}
						</span>
					)}
				</div>
				{t.note && (
					<div
						style={{
							marginTop: 8,
							color: "var(--fg-faint)",
							fontSize: "var(--fs-12)",
						}}
					>
						{t.note}
					</div>
				)}
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					position: "relative",
					zIndex: 1,
				}}
			>
				{t.mode === "auto" ? (
					<Button variant="primary" size="md">
						<Icon name="push" size={12} /> 立即运行
					</Button>
				) : (
					<Button variant="primary" size="md">
						<Icon name="check" size={12} /> 标记完成
					</Button>
				)}
				<Button size="sm">
					<Icon name="edit" size={12} /> 延后
				</Button>
			</div>
		</div>
	);
}

function V4_UpcomingList({ items }) {
	return (
		<div
			style={{
				background: "var(--surface)",
				border: "1px solid var(--line)",
				borderRadius: "var(--r-4)",
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					padding: "10px 14px",
					borderBottom: "1px solid var(--line)",
					display: "flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				<span
					style={{
						fontSize: "var(--fs-12)",
						fontWeight: "var(--fw-semibold)",
						letterSpacing: "var(--ls-caps)",
					}}
				>
					未来待办
				</span>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "var(--fs-11)",
						color: "var(--fg-mute)",
					}}
				>
					{items.length}
				</span>
			</div>
			<div style={{ flex: 1, overflow: "auto" }}>
				{items.map((t, i) => (
					<div
						key={t.id}
						style={{
							padding: "10px 14px",
							borderBottom:
								i === items.length - 1 ? "none" : "1px solid var(--line)",
							display: "grid",
							gridTemplateColumns: "56px 1fr auto",
							gap: 10,
							alignItems: "center",
						}}
					>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "var(--fs-11)",
								color: "var(--fg-mute)",
							}}
						>
							{fmtDay(t.dueAt)}
						</span>
						<div
							style={{
								minWidth: 0,
								display: "flex",
								flexDirection: "column",
								gap: 2,
							}}
						>
							<div
								style={{
									fontSize: "var(--fs-13)",
									fontWeight: "var(--fw-medium)",
								}}
							>
								{t.title}
							</div>
							<div
								style={{
									display: "flex",
									gap: 8,
									alignItems: "center",
									color: "var(--fg-mute)",
									fontSize: "var(--fs-11)",
								}}
							>
								<span style={{ fontFamily: "var(--font-mono)" }}>
									{fmtTime(t.dueAt)}
								</span>
								<ModePill mode={t.mode} />
								{t.project && <ProjectChip project={t.project} />}
							</div>
						</div>
						<div style={{ display: "flex", gap: 4 }}>
							<IconButton title="完成">
								<Icon name="check" size={13} />
							</IconButton>
							<IconButton title="更多">
								<Icon name="moreH" size={13} />
							</IconButton>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function V4_DoneRail({ items }) {
	return (
		<div
			style={{
				background: "var(--surface-sunk)",
				border: "1px solid var(--line)",
				borderRadius: "var(--r-4)",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			<div
				style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}
			>
				<div
					style={{
						fontSize: "var(--fs-12)",
						fontWeight: "var(--fw-semibold)",
						letterSpacing: "var(--ls-caps)",
					}}
				>
					今日已完成
				</div>
				<div
					style={{
						fontSize: "var(--fs-11)",
						color: "var(--fg-mute)",
						marginTop: 2,
					}}
				>
					{items.length} 条
				</div>
			</div>
			<div
				style={{
					padding: "10px 14px",
					display: "flex",
					flexDirection: "column",
					gap: 10,
					flex: 1,
				}}
			>
				{items.map((it) => (
					<div
						key={it.id}
						style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
					>
						<span
							style={{
								marginTop: 6,
								width: 8,
								height: 8,
								borderRadius: "50%",
								background: "var(--success)",
							}}
						/>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									fontSize: "var(--fs-12)",
									color: "var(--fg-mute)",
									textDecoration: "line-through",
								}}
							>
								{it.title}
							</div>
							<div
								style={{
									fontFamily: "var(--font-mono)",
									fontSize: "var(--fs-10)",
									color: "var(--fg-faint)",
								}}
							>
								{fmtTime(it.at)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

Object.assign(window, {
	V1_FixedList,
	V2_Timeline,
	V3_CardGrid,
	V4_Hero,
});
