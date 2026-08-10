// Small feather-style icons — hairline strokes for a quieter feel than
// the VSCode set used in the real BranchMenu. Exported to window.
const IconBranch = ({ className = "", size = 12 }) => (
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
		<circle cx="6" cy="4" r="1.6" />
		<circle cx="6" cy="20" r="1.6" />
		<circle cx="18" cy="12" r="1.6" />
		<path d="M6 6v12" />
		<path d="M6 10c0 2 2 2 4 2s4 0 4-2" />
	</svg>
);

const IconChevron = ({ className = "", size = 10 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M6 9l6 6 6-6" />
	</svg>
);

const IconSearch = ({ className = "", size = 12 }) => (
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
		<circle cx="11" cy="11" r="6" />
		<path d="M20 20l-3.5-3.5" />
	</svg>
);

const IconRefresh = ({ className = "", size = 11 }) => (
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
		<path d="M4 12a8 8 0 0 1 14-5.3" />
		<path d="M18 3v4h-4" />
		<path d="M20 12a8 8 0 0 1-14 5.3" />
		<path d="M6 21v-4h4" />
	</svg>
);

const IconPlus = ({ className = "", size = 11 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 5v14M5 12h14" />
	</svg>
);

const IconCheck = ({ className = "", size = 11 }) => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M5 12l4 4 10-10" />
	</svg>
);

const IconCloud = ({ className = "", size = 12 }) => (
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
		<path d="M7 16a4 4 0 1 1 1-7.9A5.5 5.5 0 0 1 19 10a3.5 3.5 0 0 1-1 6.9H8" />
		<path d="M12 12v6M9 15l3 3 3-3" />
	</svg>
);

const IconMerge = ({ className = "", size = 12 }) => (
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
		<path d="M6 10c0 4 4 6 8 6h2" />
	</svg>
);

const IconFilter = ({ className = "", size = 11 }) => (
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
		<path d="M4 5h16l-6 8v6l-4-2v-4z" />
	</svg>
);

const IconDot = ({ className = "", size = 6 }) => (
	<svg className={className} viewBox="0 0 6 6" width={size} height={size}>
		<circle cx="3" cy="3" r="3" fill="currentColor" />
	</svg>
);

Object.assign(window, {
	IconBranch,
	IconChevron,
	IconSearch,
	IconRefresh,
	IconPlus,
	IconCheck,
	IconCloud,
	IconMerge,
	IconFilter,
	IconDot,
});
