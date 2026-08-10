import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

export function Empty({
	iconName = "search",
	title,
	description,
	action,
	className,
	...rest
}) {
	return (
		<div
			className={["ds-empty", className].filter(Boolean).join(" ")}
			{...rest}
		>
			<span className="halo">
				<Icon name={iconName} size={18} className="glyph" />
			</span>
			<div className="title">{title}</div>
			{description ? <div className="desc">{description}</div> : null}
			{action ? <div className="cta">{action}</div> : null}
		</div>
	);
}
