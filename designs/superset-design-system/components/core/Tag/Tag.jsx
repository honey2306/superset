const _React = window.React;

export function Tag({ dir, children, className, ...rest }) {
	const cls = ["tag", dir, className].filter(Boolean).join(" ");
	return (
		<span className={cls} {...rest}>
			{dir === "up" ? "↑ " : dir === "down" ? "↓ " : null}
			{children}
		</span>
	);
}
