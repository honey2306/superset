const _React = window.React;

export function Divider({ label, className, ...rest }) {
	const cls = ["divider", label ? "with-label" : null, className]
		.filter(Boolean)
		.join(" ");
	return (
		<div
			className={cls}
			role="separator"
			aria-orientation="horizontal"
			{...rest}
		>
			{label ? <span className="lbl">{label}</span> : null}
		</div>
	);
}
