const _React = window.React;
const { useState, useId } = window.React;

export function Slider({
	value,
	defaultValue = 50,
	min = 0,
	max = 100,
	step = 1,
	onChange,
	className,
	...rest
}) {
	const [internal, setInternal] = useState(defaultValue);
	const controlled = value !== undefined;
	const v = controlled ? value : internal;
	const id = useId();
	const pct = ((v - min) / (max - min)) * 100;
	return (
		<span className={["ds-slider", className].filter(Boolean).join(" ")}>
			<span className="track">
				<span className="fill" style={{ width: `${pct}%` }} />
			</span>
			<input
				type="range"
				id={id}
				min={min}
				max={max}
				step={step}
				value={v}
				onChange={(e) => {
					const n = Number(e.target.value);
					if (!controlled) setInternal(n);
					onChange?.(n);
				}}
				{...rest}
			/>
		</span>
	);
}
