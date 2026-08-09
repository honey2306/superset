// Shared UI atoms for the four variants.
// Each variant renders inside a fixed 1160×760 artboard that emulates the
// app's main-content area (TopBar + workspace-sidebar sliver + main pane).
const { Badge, Button, Chip, Icon, IconButton, Kbd, Tag } =
	window.SupersetDesignSystem_91a6da;

const AB_W = 1160;
const AB_H = 760;

// Small chrome around the actual page — a slim workspace sidebar and topbar
// so the variant is visualised the way users actually see it.
function AppFrame({ children, sidebarActive = "待办" }) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "196px 1fr",
				width: AB_W,
				height: AB_H,
				background: "var(--page-bg)",
				color: "var(--fg)",
				fontFamily: "var(--font-ui)",
				fontSize: "var(--fs-13)",
				lineHeight: "var(--lh-body)",
				overflow: "hidden",
				borderRadius: "8px",
			}}
		>
			<MiniSidebar active={sidebarActive} />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					minWidth: 0,
					minHeight: 0,
				}}
			>
				{children}
			</div>
		</div>
	);
}

function MiniSidebar({ active }) {
	const items = [
		{ label: "自动化任务", icon: "spark" },
		{ label: "待办", icon: "check", alert: true },
		{ label: "临时工作区", icon: "changes" },
	];
	return (
		<div
			style={{
				background: "var(--surface)",
				borderRight: "1px solid var(--line)",
				padding: "10px 8px",
				display: "flex",
				flexDirection: "column",
				gap: "2px",
				fontSize: "var(--fs-12)",
			}}
		>
			<div
				style={{
					padding: "4px 10px 10px",
					color: "var(--fg-mute)",
					fontSize: "var(--fs-11)",
					letterSpacing: "var(--ls-eyebrow)",
					textTransform: "uppercase",
				}}
			>
				Workspace
			</div>
			{items.map((it) => {
				const isActive = it.label === active;
				return (
					<div
						key={it.label}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							padding: "6px 10px",
							borderRadius: "var(--r-3)",
							background: isActive ? "var(--selected)" : "transparent",
							color: isActive ? "var(--fg)" : "var(--fg-mute)",
							position: "relative",
						}}
					>
						<Icon name={it.icon} size={14} />
						<span style={{ flex: 1 }}>{it.label}</span>
						{it.alert && (
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: "var(--accent)",
									boxShadow:
										"0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent)",
								}}
							/>
						)}
					</div>
				);
			})}
			<div style={{ height: 12 }} />
			<div
				style={{
					padding: "4px 10px 6px",
					color: "var(--fg-mute)",
					fontSize: "var(--fs-11)",
					letterSpacing: "var(--ls-eyebrow)",
					textTransform: "uppercase",
				}}
			>
				项目
			</div>
			{["superset", "mini-krow", "temporary"].map((p) => (
				<div
					key={p}
					style={{
						display: "flex",
						alignItems: "center",
						gap: "8px",
						padding: "5px 10px",
						color: "var(--fg-mute)",
					}}
				>
					<span
						style={{
							width: 16,
							height: 16,
							background: "var(--surface-elev)",
							borderRadius: "var(--r-2)",
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							fontFamily: "var(--font-mono)",
							fontSize: "10px",
							color: "var(--fg-mute)",
						}}
					>
						{p[0].toUpperCase()}
					</span>
					<span>{p}</span>
				</div>
			))}
		</div>
	);
}

// A little pill for the mode column
function ModePill({ mode }) {
	const isAuto = mode === "auto";
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "5px",
				padding: "2px 8px 2px 6px",
				borderRadius: "var(--r-pill)",
				background: isAuto
					? "color-mix(in oklch, var(--accent) 14%, transparent)"
					: "var(--surface-elev)",
				color: isAuto ? "var(--accent)" : "var(--fg-mute)",
				fontSize: "var(--fs-11)",
				fontWeight: "var(--fw-medium)",
				letterSpacing: "var(--ls-caps)",
			}}
		>
			<Icon name={isAuto ? "spark" : "check"} size={11} />
			{isAuto ? "AUTO" : "REMIND"}
		</span>
	);
}

// Project chip (icon + name)
function ProjectChip({ project }) {
	if (!project) return null;
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "5px",
				fontSize: "var(--fs-11)",
				color: "var(--fg-mute)",
			}}
		>
			<span
				style={{
					width: 14,
					height: 14,
					background: "var(--surface-elev)",
					borderRadius: "var(--r-2)",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					fontFamily: "var(--font-mono)",
					fontSize: "9px",
					color: "var(--fg-mute)",
				}}
			>
				{project.icon}
			</span>
			{project.name}
		</span>
	);
}

// Colored status dot
function StatusDot({ status, size = 8 }) {
	const map = {
		overdue: "var(--danger)",
		today: "var(--warning)",
		week: "var(--info)",
		later: "var(--fg-mute)",
		failed: "var(--danger)",
		done: "var(--success)",
	};
	return (
		<span
			style={{
				display: "inline-block",
				width: size,
				height: size,
				borderRadius: "50%",
				background: map[status] ?? "var(--fg-mute)",
			}}
		/>
	);
}

// Simple stat card for the top of a variant
function StatCard({ label, value, tone }) {
	const toneColor = {
		danger: "var(--danger)",
		warning: "var(--warning)",
		info: "var(--info)",
		muted: "var(--fg)",
	}[tone ?? "muted"];
	return (
		<div
			style={{
				background: "var(--surface)",
				border: "1px solid var(--line)",
				borderRadius: "var(--r-4)",
				padding: "10px 14px",
				minWidth: 108,
				display: "flex",
				flexDirection: "column",
				gap: "2px",
			}}
		>
			<div
				style={{
					fontSize: "var(--fs-10)",
					color: "var(--fg-mute)",
					letterSpacing: "var(--ls-eyebrow)",
					textTransform: "uppercase",
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: "var(--fs-22)",
					fontWeight: "var(--fw-semibold)",
					color: toneColor,
					lineHeight: 1.1,
				}}
			>
				{value}
			</div>
		</div>
	);
}

Object.assign(window, {
	AB_W,
	AB_H,
	AppFrame,
	ModePill,
	ProjectChip,
	StatusDot,
	StatCard,
});
