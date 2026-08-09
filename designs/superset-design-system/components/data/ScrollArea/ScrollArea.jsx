const _React = window.React;
export function ScrollArea({ children, maxHeight, className, ...rest }) {
	return (
		<div
			className={["ds-scroll", className].filter(Boolean).join(" ")}
			style={{ maxHeight }}
			{...rest}
		>
			{children}
		</div>
	);
}
