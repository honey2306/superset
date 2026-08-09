// Superset DS — Icon
// A single line-icon component that dispatches on `name`. All icons render at
// 24-viewbox with stroke=currentColor so a parent can tint them via CSS.

const _React = window.React;

const P = {
	branch: (
		<>
			<circle cx="6" cy="4" r="2" />
			<circle cx="6" cy="20" r="2" />
			<circle cx="18" cy="8" r="2" />
			<path d="M6 6v12" />
			<path d="M18 10c0 3-2 4-6 4H6" />
		</>
	),
	chevron: <polyline points="6 9 12 15 18 9" />,
	search: (
		<>
			<circle cx="11" cy="11" r="7" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</>
	),
	plus: (
		<>
			<path d="M12 5v14" />
			<path d="M5 12h14" />
		</>
	),
	check: <polyline points="20 6 9 17 4 12" />,
	refresh: (
		<>
			<polyline points="23 4 23 10 17 10" />
			<polyline points="1 20 1 14 7 14" />
			<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
			<path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
		</>
	),
	push: (
		<>
			<line x1="12" y1="19" x2="12" y2="5" />
			<polyline points="5 12 12 5 19 12" />
		</>
	),
	pull: (
		<>
			<line x1="12" y1="5" x2="12" y2="19" />
			<polyline points="19 12 12 19 5 12" />
		</>
	),
	merge: (
		<>
			<circle cx="6" cy="4" r="2" />
			<circle cx="6" cy="20" r="2" />
			<circle cx="18" cy="12" r="2" />
			<path d="M6 6v12" />
			<path d="M18 10c-4 0-8-3-12-6" />
		</>
	),
	arrowRight: (
		<>
			<line x1="5" y1="12" x2="19" y2="12" />
			<polyline points="12 5 19 12 12 19" />
		</>
	),
	edit: (
		<>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</>
	),
	copy: (
		<>
			<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</>
	),
	terminal: (
		<>
			<polyline points="4 17 10 11 4 5" />
			<line x1="12" y1="19" x2="20" y2="19" />
		</>
	),
	trash: (
		<>
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
			<path d="M10 11v6M14 11v6" />
		</>
	),
	alert: (
		<>
			<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
			<line x1="12" y1="9" x2="12" y2="13" />
			<circle cx="12" cy="17" r="0.5" />
		</>
	),
	file: (
		<>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
			<polyline points="14 2 14 8 20 8" />
		</>
	),
	cloud: (
		<path d="M17.5 19a4.5 4.5 0 0 0 0-9c-.28 0-.55.03-.82.08A6.5 6.5 0 0 0 4 12a5 5 0 0 0 5 7h8.5z" />
	),
	changes: <path d="M4 6h16M4 12h10M4 18h16" />,
	max: <rect x="4" y="4" width="16" height="16" rx="2" />,
	x: (
		<>
			<line x1="6" y1="6" x2="18" y2="18" />
			<line x1="6" y1="18" x2="18" y2="6" />
		</>
	),
	sort: (
		<>
			<line x1="5" y1="7" x2="19" y2="7" />
			<line x1="7" y1="12" x2="17" y2="12" />
			<line x1="10" y1="17" x2="14" y2="17" />
		</>
	),
	moreH: (
		<>
			<circle cx="6" cy="12" r="1.2" />
			<circle cx="12" cy="12" r="1.2" />
			<circle cx="18" cy="12" r="1.2" />
		</>
	),
	spark: (
		<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
	),
	workflow: (
		<>
			<rect x="3" y="3" width="7" height="6" rx="1" />
			<rect x="14" y="15" width="7" height="6" rx="1" />
			<path d="M10 6h4a2 2 0 0 1 2 2v4" />
			<path d="M14 15v-3" />
		</>
	),
	listTodo: (
		<>
			<rect x="3" y="4" width="6" height="6" rx="1" />
			<polyline points="4 7 5 8 8 5" />
			<rect x="3" y="14" width="6" height="6" rx="1" />
			<line x1="12" y1="6" x2="21" y2="6" />
			<line x1="12" y1="17" x2="21" y2="17" />
		</>
	),
	clock: (
		<>
			<circle cx="12" cy="12" r="9" />
			<polyline points="12 7 12 12 15 14" />
		</>
	),
	paperclip: (
		<path d="M21 11l-8.5 8.5a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 1 1 4.24 4.24L9.65 16.75a1 1 0 1 1-1.41-1.41l7.78-7.78" />
	),
	arrowUp: (
		<>
			<line x1="12" y1="19" x2="12" y2="5" />
			<polyline points="5 12 12 5 19 12" />
		</>
	),
	arrowLeft: (
		<>
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="12 19 5 12 12 5" />
		</>
	),
	stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
	pr: (
		<>
			<circle cx="6" cy="6" r="2" />
			<circle cx="6" cy="18" r="2" />
			<circle cx="18" cy="18" r="2" />
			<path d="M6 8v8" />
			<path d="M8 6h4a4 4 0 0 1 4 4v6" />
		</>
	),
	radioTower: (
		<>
			<path d="M4.9 16.1a10 10 0 0 1 0-8.2" />
			<path d="M7.8 13.3a6 6 0 0 1 0-2.6" />
			<circle cx="12" cy="12" r="2" />
			<path d="M16.2 10.7a6 6 0 0 1 0 2.6" />
			<path d="M19.1 7.9a10 10 0 0 1 0 8.2" />
			<line x1="12" y1="16" x2="12" y2="22" />
		</>
	),
};

export function Icon({ name, size = 14, className, style, ...rest }) {
	const paths = P[name];
	if (!paths) return null;
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			style={style}
			aria-hidden="true"
			{...rest}
		>
			{paths}
		</svg>
	);
}
