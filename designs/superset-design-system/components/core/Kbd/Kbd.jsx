const _React = window.React;
export function Kbd({ children, className, ...rest }) {
	return (
		<span className={["kbd", className].filter(Boolean).join(" ")} {...rest}>
			{children}
		</span>
	);
}
