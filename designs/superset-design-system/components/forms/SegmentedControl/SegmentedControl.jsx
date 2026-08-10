const _React = window.React;

export function SegmentedControl({ options, value, onChange, className }) {
	return (
		<div className={["segmented", className].filter(Boolean).join(" ")}>
			{options.map((opt) => {
				const v = typeof opt === "string" ? opt : opt.value;
				const label = typeof opt === "string" ? opt : opt.label;
				return (
					<button
						key={v}
						className={v === value ? "is-active" : ""}
						onClick={() => onChange?.(v)}
					>
						{label}
					</button>
				);
			})}
		</div>
	);
}
