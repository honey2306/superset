const _React = window.React;
export function Label({ htmlFor, required, children, className, ...rest }) {
	return (
		<label
			htmlFor={htmlFor}
			className={["ds-label", className].filter(Boolean).join(" ")}
			{...rest}
		>
			{children}
			{required ? (
				<span className="req" aria-hidden>
					{" "}
					*
				</span>
			) : null}
		</label>
	);
}
