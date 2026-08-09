const _React = window.React;

export function Radio({
	checked,
	defaultChecked,
	onChange,
	name,
	value,
	children,
	className,
	...rest
}) {
	return (
		<label className={["radio", className].filter(Boolean).join(" ")}>
			<input
				type="radio"
				name={name}
				value={value}
				checked={checked}
				defaultChecked={defaultChecked}
				onChange={onChange}
				{...rest}
			/>
			<span className="dot" aria-hidden />
			{children}
		</label>
	);
}
