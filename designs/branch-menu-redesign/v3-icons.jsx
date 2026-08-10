// v3 icons — everything the context menu / sidebar frame needs beyond v2-icons.
const IconArrowRight = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M5 12h14" />
		<path d="M13 6l6 6-6 6" />
	</svg>
);

const IconMoreH = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
	>
		<circle cx="5" cy="12" r="1" />
		<circle cx="12" cy="12" r="1" />
		<circle cx="19" cy="12" r="1" />
	</svg>
);

const IconArrowUp = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 5v14" />
		<path d="M6 11l6-6 6 6" />
	</svg>
);

const IconArrowDown = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 5v14" />
		<path d="M6 13l6 6 6-6" />
	</svg>
);

const IconTrash = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M4 7h16" />
		<path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
		<path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
		<path d="M10 11v6" />
		<path d="M14 11v6" />
	</svg>
);

const IconEdit = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M15 4l5 5" />
		<path d="M4 20l4-1L20 7l-5-5L3 15l-1 4z" />
	</svg>
);

const IconCopy = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<rect x="9" y="9" width="11" height="11" rx="2" />
		<path d="M5 15V6a1 1 0 0 1 1-1h9" />
	</svg>
);

const IconTerminal = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<rect x="3" y="4" width="18" height="16" rx="2" />
		<path d="M7 9l3 3-3 3" />
		<path d="M13 15h5" />
	</svg>
);

const IconGitPull = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="6" cy="6" r="1.6" />
		<circle cx="6" cy="18" r="1.6" />
		<circle cx="18" cy="18" r="1.6" />
		<path d="M6 8v8" />
		<path d="M18 12v4" />
		<path d="M18 12a4 4 0 0 0-4-4h-4" />
		<path d="M10 5l-2 3 2 3" />
	</svg>
);

const IconGitPush = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="6" cy="18" r="1.6" />
		<circle cx="18" cy="18" r="1.6" />
		<circle cx="12" cy="6" r="1.6" />
		<path d="M6 16V9" />
		<path d="M18 16v-4" />
		<path d="M18 12a4 4 0 0 0-4-4h-2" />
		<path d="M12 3v6" />
		<path d="M9 6l3-3 3 3" />
	</svg>
);

const IconStar = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6L12 16.9 6.6 19.3l1.3-6L3.4 9.2l6-.6z" />
	</svg>
);

const IconStarFill = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="currentColor"
		stroke="currentColor"
		strokeWidth="1.2"
		strokeLinejoin="round"
	>
		<path d="M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6L12 16.9 6.6 19.3l1.3-6L3.4 9.2l6-.6z" />
	</svg>
);

const IconAlert = ({ className = "", size = 14 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.7"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 3l10 18H2z" />
		<path d="M12 10v5" />
		<circle cx="12" cy="18" r="0.6" fill="currentColor" />
	</svg>
);

const IconX = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
	>
		<path d="M6 6l12 12M18 6L6 18" />
	</svg>
);

const IconMax = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M4 9V4h5" />
		<path d="M20 9V4h-5" />
		<path d="M4 15v5h5" />
		<path d="M20 15v5h-5" />
	</svg>
);

const IconFile = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
		<path d="M14 3v6h6" />
	</svg>
);

const IconChanges = ({ className = "", size = 14 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="6" cy="6" r="2.2" />
		<circle cx="18" cy="18" r="2.2" />
		<path d="M8 6h6a4 4 0 0 1 4 4v6" />
	</svg>
);

const IconSort = ({ className = "", size = 12 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M6 6h12" />
		<path d="M8 12h8" />
		<path d="M10 18h4" />
	</svg>
);

Object.assign(window, {
	IconArrowRight,
	IconMoreH,
	IconArrowUp,
	IconArrowDown,
	IconTrash,
	IconEdit,
	IconCopy,
	IconTerminal,
	IconGitPull,
	IconGitPush,
	IconStar,
	IconStarFill,
	IconAlert,
	IconX,
	IconMax,
	IconFile,
	IconChanges,
	IconSort,
});
