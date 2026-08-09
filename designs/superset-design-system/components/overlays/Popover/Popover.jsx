// Popover container — layout only. Compose with PopoverHeader / PopoverGroup /
// PopoverRow / PopoverSep / PopoverHint. Positioning is the caller's job
// (typically absolute-under a Pill trigger).

import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

export function Popover({ children, className, style, ...rest }) {
	return (
		<div
			className={["popover", className].filter(Boolean).join(" ")}
			style={style}
			{...rest}
		>
			{children}
		</div>
	);
}

export function PopoverHeader({
	iconName = "search",
	placeholder,
	value,
	onChange,
	inputRef,
	trailing,
}) {
	return (
		<div className="popover-head">
			<Icon name={iconName} className="glyph" size={13} />
			<input
				ref={inputRef}
				value={value}
				onChange={onChange && ((e) => onChange(e.target.value))}
				placeholder={placeholder}
				spellCheck={false}
			/>
			{trailing}
		</div>
	);
}

export function PopoverGroup({ label, count, action }) {
	return (
		<div className="popover-group">
			<span>
				{label}
				{typeof count === "number" ? ` · ${count}` : null}
			</span>
			{action}
		</div>
	);
}

export function PopoverRow({
	iconName = "branch",
	name,
	current,
	focused,
	tag,
	end,
	onClick,
	onContextMenu,
	className,
}) {
	const cls = [
		"popover-row",
		current && "is-current",
		focused && "is-focused",
		className,
	]
		.filter(Boolean)
		.join(" ");
	return (
		<div
			className={cls}
			role="button"
			tabIndex={0}
			onClick={onClick}
			onContextMenu={onContextMenu}
		>
			<Icon name={iconName} className="glyph" size={12} />
			<span className="name">{name}</span>
			{tag}
			<span className="end">
				{current ? <Icon name="check" className="check-icon" size={12} /> : end}
			</span>
		</div>
	);
}

export function PopoverSep() {
	return <div className="popover-sep" />;
}

export function PopoverHint({ children }) {
	return <div className="popover-hint">{children}</div>;
}
