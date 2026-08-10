const _React = window.React;

export function Switch({ checked, onChange, className, ...rest }) {
	return (
		<span
			role="switch"
			aria-checked={checked ? "true" : "false"}
			tabIndex={0}
			onClick={() => onChange?.(!checked)}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					onChange?.(!checked);
				}
			}}
			className={["switch", className].filter(Boolean).join(" ")}
			{...rest}
		/>
	);
}
