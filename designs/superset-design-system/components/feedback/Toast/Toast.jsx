import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

const DEFAULT_ICON = {
	success: "check",
	info: "spark",
	warn: "alert",
	error: "x",
};

export function Toast({
	tone = "info",
	iconName,
	children,
	className,
	...rest
}) {
	const cls = ["toast", tone !== "info" && tone, className]
		.filter(Boolean)
		.join(" ");
	const name = iconName || DEFAULT_ICON[tone] || "spark";
	return (
		<div className={cls} {...rest}>
			<Icon name={name} className="glyph" size={14} />
			<span>{children}</span>
		</div>
	);
}
