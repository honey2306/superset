import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

export function Tabs({ items, value, onChange, trailing, className }) {
	return (
		<div className={["tabs", className].filter(Boolean).join(" ")}>
			{items.map((it) => {
				const cls = `tab${it.value === value ? " is-active" : ""}`;
				return (
					<button
						key={it.value}
						className={cls}
						onClick={() => onChange?.(it.value)}
					>
						{it.iconName ? <Icon name={it.iconName} size={14} /> : null}
						{it.label}
					</button>
				);
			})}
			{trailing ? <span style={{ flex: 1 }} /> : null}
			{trailing}
		</div>
	);
}
