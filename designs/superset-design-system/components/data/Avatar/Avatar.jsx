const _React = window.React;
function initials(name) {
	const parts = String(name || "?")
		.trim()
		.split(/\s+/);
	return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
export function Avatar({ name, src, size = 24, className, ...rest }) {
	return (
		<span
			className={["ds-avatar", className].filter(Boolean).join(" ")}
			style={{ width: size, height: size, fontSize: Math.max(9, size / 2.4) }}
			{...rest}
		>
			{src ? <img src={src} alt={name} /> : initials(name)}
		</span>
	);
}
