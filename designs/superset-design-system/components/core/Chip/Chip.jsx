const _React = window.React;

export function Chip({ tone, children, className, ...rest }) {
	return (
		<span className={["chip", className].filter(Boolean).join(" ")} {...rest}>
			{tone ? <span className={`dot ${tone}`} /> : null}
			{children}
		</span>
	);
}
