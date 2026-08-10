// Shared icon set — 14x14 line icons matching the branch-menu v3 style.
// stroke=currentColor, so any component can tint them via CSS.

const Svg = ({ children, size = 14, ...rest }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...rest}
	>
		{children}
	</svg>
);

const IconBranch = (p) => (
	<Svg {...p}>
		<circle cx="6" cy="4" r="2" />
		<circle cx="6" cy="20" r="2" />
		<circle cx="18" cy="8" r="2" />
		<path d="M6 6v12" />
		<path d="M18 10c0 3-2 4-6 4H6" />
	</Svg>
);
const IconChevron = (p) => (
	<Svg {...p}>
		<polyline points="6 9 12 15 18 9" />
	</Svg>
);
const IconSearch = (p) => (
	<Svg {...p}>
		<circle cx="11" cy="11" r="7" />
		<line x1="21" y1="21" x2="16.65" y2="16.65" />
	</Svg>
);
const IconPlus = (p) => (
	<Svg {...p}>
		<path d="M12 5v14" />
		<path d="M5 12h14" />
	</Svg>
);
const IconCheck = (p) => (
	<Svg {...p}>
		<polyline points="20 6 9 17 4 12" />
	</Svg>
);
const IconRefresh = (p) => (
	<Svg {...p}>
		<polyline points="23 4 23 10 17 10" />
		<polyline points="1 20 1 14 7 14" />
		<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
		<path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
	</Svg>
);
const IconGitPush = (p) => (
	<Svg {...p}>
		<line x1="12" y1="19" x2="12" y2="5" />
		<polyline points="5 12 12 5 19 12" />
	</Svg>
);
const IconGitPull = (p) => (
	<Svg {...p}>
		<line x1="12" y1="5" x2="12" y2="19" />
		<polyline points="19 12 12 19 5 12" />
	</Svg>
);
const IconMerge = (p) => (
	<Svg {...p}>
		<circle cx="6" cy="4" r="2" />
		<circle cx="6" cy="20" r="2" />
		<circle cx="18" cy="12" r="2" />
		<path d="M6 6v12" />
		<path d="M18 10c-4 0-8-3-12-6" />
	</Svg>
);
const IconArrowRight = (p) => (
	<Svg {...p}>
		<line x1="5" y1="12" x2="19" y2="12" />
		<polyline points="12 5 19 12 12 19" />
	</Svg>
);
const IconEdit = (p) => (
	<Svg {...p}>
		<path d="M12 20h9" />
		<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
	</Svg>
);
const IconCopy = (p) => (
	<Svg {...p}>
		<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	</Svg>
);
const IconTerminal = (p) => (
	<Svg {...p}>
		<polyline points="4 17 10 11 4 5" />
		<line x1="12" y1="19" x2="20" y2="19" />
	</Svg>
);
const IconTrash = (p) => (
	<Svg {...p}>
		<polyline points="3 6 5 6 21 6" />
		<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
		<path d="M10 11v6M14 11v6" />
	</Svg>
);
const IconAlert = (p) => (
	<Svg {...p}>
		<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
		<line x1="12" y1="9" x2="12" y2="13" />
		<circle cx="12" cy="17" r="0.5" />
	</Svg>
);
const IconFile = (p) => (
	<Svg {...p}>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
		<polyline points="14 2 14 8 20 8" />
	</Svg>
);
const IconCloud = (p) => (
	<Svg {...p}>
		<path d="M17.5 19a4.5 4.5 0 0 0 0-9c-.28 0-.55.03-.82.08A6.5 6.5 0 0 0 4 12a5 5 0 0 0 5 7h8.5z" />
	</Svg>
);
const IconChanges = (p) => (
	<Svg {...p}>
		<path d="M4 6h16M4 12h10M4 18h16" />
	</Svg>
);
const IconMax = (p) => (
	<Svg {...p}>
		<rect x="4" y="4" width="16" height="16" rx="2" />
	</Svg>
);
const IconX = (p) => (
	<Svg {...p}>
		<line x1="6" y1="6" x2="18" y2="18" />
		<line x1="6" y1="18" x2="18" y2="6" />
	</Svg>
);
const IconSort = (p) => (
	<Svg {...p}>
		<line x1="5" y1="7" x2="19" y2="7" />
		<line x1="7" y1="12" x2="17" y2="12" />
		<line x1="10" y1="17" x2="14" y2="17" />
	</Svg>
);
const IconMoreH = (p) => (
	<Svg {...p}>
		<circle cx="6" cy="12" r="1.2" />
		<circle cx="12" cy="12" r="1.2" />
		<circle cx="18" cy="12" r="1.2" />
	</Svg>
);
const IconSpark = (p) => (
	<Svg {...p}>
		<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
	</Svg>
);

Object.assign(window, {
	IconBranch,
	IconChevron,
	IconSearch,
	IconPlus,
	IconCheck,
	IconRefresh,
	IconGitPush,
	IconGitPull,
	IconMerge,
	IconArrowRight,
	IconEdit,
	IconCopy,
	IconTerminal,
	IconTrash,
	IconAlert,
	IconFile,
	IconCloud,
	IconChanges,
	IconMax,
	IconX,
	IconSort,
	IconMoreH,
	IconSpark,
});
