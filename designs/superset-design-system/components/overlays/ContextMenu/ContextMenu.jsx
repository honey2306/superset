// Right-click context menu. Compose with sections; the container handles no
// positioning — pass fixed coordinates in a wrapping `style` at the call site.

import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

export function ContextMenu({ children, className, style, ...rest }) {
	return (
		<div
			className={["menu", className].filter(Boolean).join(" ")}
			style={style}
			role="menu"
			{...rest}
		>
			{children}
		</div>
	);
}

export function MenuHeading({ iconName = "branch", title, badge }) {
	return (
		<div className="menu-heading">
			<Icon name={iconName} className="glyph" size={12} />
			<span>{title}</span>
			{badge}
		</div>
	);
}

export function MenuSep() {
	return <div className="menu-sep" />;
}
export function MenuGroup({ children }) {
	return <div className="menu-group">{children}</div>;
}

export function MenuItem({
	iconName,
	label,
	danger,
	disabled,
	kbd,
	tag,
	onClick,
	title,
}) {
	const cls = ["menu-item", disabled && "is-disabled", danger && "is-danger"]
		.filter(Boolean)
		.join(" ");
	return (
		<button
			type="button"
			className={cls}
			onClick={disabled ? undefined : onClick}
			title={disabled ? title : undefined}
		>
			{iconName ? <Icon name={iconName} className="glyph" size={13} /> : null}
			<span className="label">{label}</span>
			{tag}
			{kbd}
		</button>
	);
}
