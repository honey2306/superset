type TreeIconName = "chevron" | "project" | "workspace" | "acp" | "terminal";

export function TreeIcon({ name }: { name: TreeIconName }) {
	if (name === "chevron") {
		return (
			<svg aria-hidden="true" viewBox="0 0 16 16">
				<path
					d="m3.5 5.5 4.5 4.5 4.5-4.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
				/>
			</svg>
		);
	}
	if (name === "terminal") {
		return (
			<svg aria-hidden="true" viewBox="0 0 16 16">
				<path
					d="m3 4 3 4-3 4M8.5 12h4"
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeWidth="1.5"
				/>
			</svg>
		);
	}
	if (name === "acp") {
		return (
			<svg aria-hidden="true" viewBox="0 0 16 16">
				<path
					d="m8 2 .9 4.1L13 7l-4.1.9L8 12l-.9-4.1L3 7l4.1-.9L8 2Z"
					fill="none"
					stroke="currentColor"
					strokeLinejoin="round"
					strokeWidth="1.3"
				/>
			</svg>
		);
	}
	return name === "project" ? (
		<svg aria-hidden="true" viewBox="0 0 16 16">
			<path
				d="M2.5 4.5h4l1.2 1.4h5.8v6.6h-11V4.5Z"
				fill="none"
				stroke="currentColor"
				strokeLinejoin="round"
				strokeWidth="1.3"
			/>
		</svg>
	) : (
		<svg aria-hidden="true" viewBox="0 0 16 16">
			<circle cx="4" cy="4" r="1.5" fill="currentColor" />
			<circle cx="12" cy="4" r="1.5" fill="currentColor" />
			<circle cx="8" cy="12" r="1.5" fill="currentColor" />
			<path
				d="M4 5.5v1.2h8V5.5M8 6.7V10"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
		</svg>
	);
}
