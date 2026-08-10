const _React = window.React;

export function Badge({ tone, pill, children, className, ...rest }) {
	const cls = ["badge", tone, pill && "pill", className]
		.filter(Boolean)
		.join(" ");
	return (
		<span className={cls} {...rest}>
			{children}
		</span>
	);
}
