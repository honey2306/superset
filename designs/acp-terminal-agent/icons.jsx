// icons.jsx — small SVG icons; kept minimal and monochrome so each variant can
// theme via currentColor. Also unicode glyphs where a shape reads better as ASCII.

const IconAgent = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
		<circle cx="6" cy="7" r="0.9" fill="currentColor" />
		<circle cx="10" cy="7" r="0.9" fill="currentColor" />
		<path
			d="M6 10.5c.7.6 1.4.8 2 .8s1.3-.2 2-.8"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
		/>
	</svg>
);

const IconUser = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<circle cx="8" cy="5.5" r="2.4" stroke="currentColor" strokeWidth="1.4" />
		<path
			d="M3 13.5c1-2.4 3-3.6 5-3.6s4 1.2 5 3.6"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
		/>
	</svg>
);

const IconThink = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<path
			d="M4 6a4 4 0 018 0v3l1 2H3l1-2V6z"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinejoin="round"
		/>
		<path
			d="M6 13a2 2 0 004 0"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
		/>
	</svg>
);

const IconSearch = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
		<path
			d="M10.5 10.5L14 14"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
		/>
	</svg>
);

const IconRead = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<path
			d="M3 3h6l3 3v7H3z"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinejoin="round"
		/>
		<path
			d="M9 3v3h3"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinejoin="round"
		/>
	</svg>
);

const IconEdit = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<path
			d="M11.5 2.5l2 2-8 8H3.5v-2z"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinejoin="round"
		/>
		<path
			d="M10 4l2 2"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
		/>
	</svg>
);

const IconExecute = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<path
			d="M3 3l4 5-4 5"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M8 13h5"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
		/>
	</svg>
);

const IconPlan = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<rect
			x="2.5"
			y="3"
			width="11"
			height="10"
			rx="1"
			stroke="currentColor"
			strokeWidth="1.3"
		/>
		<path
			d="M5 6h6M5 8.5h6M5 11h3"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
		/>
	</svg>
);

const IconShield = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<path
			d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4l5-2z"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinejoin="round"
		/>
	</svg>
);

const IconBranch = ({ size = 12 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<circle cx="4" cy="3" r="1.4" stroke="currentColor" strokeWidth="1.3" />
		<circle cx="4" cy="13" r="1.4" stroke="currentColor" strokeWidth="1.3" />
		<circle cx="12" cy="6" r="1.4" stroke="currentColor" strokeWidth="1.3" />
		<path d="M4 4.5v7" stroke="currentColor" strokeWidth="1.3" />
		<path
			d="M4 8c0-1.5 1-2 2.5-2H10.5"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
		/>
	</svg>
);

const IconFolder = ({ size = 12 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<path
			d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1v6.5a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinejoin="round"
		/>
	</svg>
);

const IconTerminal = ({ size = 12 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
		<rect
			x="1.5"
			y="2.5"
			width="13"
			height="11"
			rx="1.5"
			stroke="currentColor"
			strokeWidth="1.3"
		/>
		<path
			d="M4 6l2.5 2L4 10"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M8 10.5h4"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
		/>
	</svg>
);

const IconChevron = ({ size = 10 }) => (
	<svg width={size} height={size} viewBox="0 0 10 10" fill="none">
		<path
			d="M2.5 3.5l2.5 3 2.5-3"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

const IconDot = ({ size = 6 }) => (
	<svg width={size} height={size} viewBox="0 0 6 6">
		<circle cx="3" cy="3" r="3" fill="currentColor" />
	</svg>
);

// Tool kind → icon map
const ToolKindIcon = ({ kind, size = 14 }) => {
	switch (kind) {
		case "search":
			return <IconSearch size={size} />;
		case "read":
			return <IconRead size={size} />;
		case "edit":
			return <IconEdit size={size} />;
		case "execute":
			return <IconExecute size={size} />;
		case "delete":
			return <IconEdit size={size} />;
		case "think":
			return <IconThink size={size} />;
		default:
			return <IconRead size={size} />;
	}
};

Object.assign(window, {
	IconAgent,
	IconUser,
	IconThink,
	IconSearch,
	IconRead,
	IconEdit,
	IconExecute,
	IconPlan,
	IconShield,
	IconBranch,
	IconFolder,
	IconTerminal,
	IconChevron,
	IconDot,
	ToolKindIcon,
});
