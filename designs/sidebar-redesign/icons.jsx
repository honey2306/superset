const Icon = ({ path, size = 16, stroke = 1.6, fill = "none", className }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill={fill}
		stroke="currentColor"
		strokeWidth={stroke}
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
		aria-hidden="true"
	>
		{path}
	</svg>
);

const IconPlus = (p) => (
	<Icon
		{...p}
		path={
			<>
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</>
		}
	/>
);

const IconSearch = (p) => (
	<Icon
		{...p}
		path={
			<>
				<circle cx="11" cy="11" r="7" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
			</>
		}
	/>
);

const IconChevron = (p) => (
	<Icon {...p} path={<polyline points="9 6 15 12 9 18" />} />
);

const IconWorktree = (p) => (
	<Icon
		{...p}
		path={
			<>
				<circle cx="6" cy="6" r="2.5" />
				<circle cx="18" cy="6" r="2.5" />
				<circle cx="12" cy="18" r="2.5" />
				<path d="M6 8.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3" />
				<line x1="12" y1="13.5" x2="12" y2="15.5" />
			</>
		}
	/>
);

const IconBranch = (p) => (
	<Icon
		{...p}
		path={
			<>
				<line x1="6" y1="3" x2="6" y2="15" />
				<circle cx="18" cy="6" r="2.5" />
				<circle cx="6" cy="18" r="2.5" />
				<circle cx="6" cy="3" r="0.5" fill="currentColor" />
				<path d="M18 8.5v1a4 4 0 0 1-4 4H8" />
			</>
		}
	/>
);

const IconSettings = (p) => (
	<Icon
		{...p}
		path={
			<>
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
			</>
		}
	/>
);

const IconCommand = (p) => (
	<Icon
		{...p}
		path={
			<path d="M18 3a3 3 0 0 0-3 3v3h3a3 3 0 0 0 0-6zM6 3a3 3 0 0 1 3 3v3H6a3 3 0 0 1 0-6zm12 18a3 3 0 0 1-3-3v-3h3a3 3 0 0 1 0 6zM6 21a3 3 0 0 0 3-3v-3H6a3 3 0 0 0 0 6zM9 9h6v6H9z" />
		}
	/>
);

const IconFilter = (p) => (
	<Icon
		{...p}
		path={<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />}
	/>
);

const IconFolder = (p) => (
	<Icon
		{...p}
		path={
			<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
		}
	/>
);

const IconPort = (p) => (
	<Icon
		{...p}
		path={
			<>
				<circle cx="12" cy="12" r="9" />
				<line x1="12" y1="3" x2="12" y2="21" />
				<path d="M3.6 9h16.8M3.6 15h16.8" />
			</>
		}
	/>
);

const IconClock = (p) => (
	<Icon
		{...p}
		path={
			<>
				<circle cx="12" cy="12" r="9" />
				<polyline points="12 7 12 12 15 14" />
			</>
		}
	/>
);

const IconStar = (p) => (
	<Icon
		{...p}
		path={
			<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
		}
	/>
);

const IconMoreH = (p) => (
	<Icon
		{...p}
		path={
			<>
				<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
				<circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
				<circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
			</>
		}
	/>
);

const IconTerminal = (p) => (
	<Icon
		{...p}
		path={
			<>
				<polyline points="4 8 8 12 4 16" />
				<line x1="12" y1="17" x2="20" y2="17" />
			</>
		}
	/>
);

const IconInbox = (p) => (
	<Icon
		{...p}
		path={
			<>
				<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
				<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
			</>
		}
	/>
);

Object.assign(window, {
	IconPlus,
	IconSearch,
	IconChevron,
	IconWorktree,
	IconBranch,
	IconSettings,
	IconCommand,
	IconFilter,
	IconFolder,
	IconPort,
	IconClock,
	IconStar,
	IconMoreH,
	IconTerminal,
	IconInbox,
});
