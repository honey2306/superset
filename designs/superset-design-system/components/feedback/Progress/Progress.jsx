const _React = window.React;
export function Progress({ value = 0, max = 100, tone, className, ...rest }) {
	const pct = Math.min(100, Math.max(0, (value / max) * 100));
	const cls = ["ds-progress", tone, className].filter(Boolean).join(" ");
	return (
		<span
			className={cls}
			role="progressbar"
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={max}
			{...rest}
		>
			<span className="fill" style={{ width: `${pct}%` }} />
		</span>
	);
}
