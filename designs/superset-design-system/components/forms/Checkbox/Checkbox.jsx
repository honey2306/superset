const _React = window.React;

export function Checkbox({
	checked,
	defaultChecked,
	onChange,
	children,
	className,
	...rest
}) {
	return (
		<label className={["check", className].filter(Boolean).join(" ")}>
			<input
				type="checkbox"
				checked={checked}
				defaultChecked={defaultChecked}
				onChange={onChange}
				{...rest}
			/>
			<span className="box" aria-hidden />
			{children}
		</label>
	);
}
