const _React = window.React;

export function IconButton({ className, children, ...rest }) {
	return (
		<button
			className={["icon-btn", className].filter(Boolean).join(" ")}
			{...rest}
		>
			{children}
		</button>
	);
}
