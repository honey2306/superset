const _React = window.React;

export function Button({
	variant = "default",
	size = "md",
	disabled,
	className,
	children,
	...rest
}) {
	const cls = [
		"btn",
		variant === "primary" && "primary",
		variant === "ghost" && "ghost",
		variant === "danger" && "danger",
		size === "sm" && "sm",
		className,
	]
		.filter(Boolean)
		.join(" ");
	return (
		<button className={cls} disabled={disabled} {...rest}>
			{children}
		</button>
	);
}
