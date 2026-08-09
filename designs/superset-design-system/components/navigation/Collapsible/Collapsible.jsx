import { Icon } from "../../core/Icon/Icon.jsx";
const _React = window.React;
const { useState } = window.React;

export function Collapsible({
	title,
	iconName,
	count,
	defaultOpen = false,
	children,
	className,
	...rest
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div
			className={["ds-collapsible", open && "is-open", className]
				.filter(Boolean)
				.join(" ")}
			{...rest}
		>
			<button
				className="head"
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<Icon name="chevron" className="chev" size={10} />
				{iconName ? <Icon name={iconName} className="glyph" size={12} /> : null}
				<span className="title">{title}</span>
				{count != null ? <span className="count">{count}</span> : null}
			</button>
			{open ? <div className="body">{children}</div> : null}
		</div>
	);
}
