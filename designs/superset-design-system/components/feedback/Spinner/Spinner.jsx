const _React = window.React;

export function Spinner({ size = 14, tone, className, ...rest }) {
	const cls = ["spinner", tone, className].filter(Boolean).join(" ");
	return (
		<span
			role="status"
			aria-label="Loading"
			className={cls}
			style={{ width: size, height: size }}
			{...rest}
		/>
	);
}
