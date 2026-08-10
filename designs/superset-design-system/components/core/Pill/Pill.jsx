import { Icon } from "../Icon/Icon.jsx";

const _React = window.React;

export function Pill({
	label,
	open,
	onClick,
	iconName = "branch",
	className,
	...rest
}) {
	return (
		<button
			type="button"
			className={["pill", className].filter(Boolean).join(" ")}
			aria-expanded={open ? "true" : "false"}
			onClick={onClick}
			{...rest}
		>
			<Icon name={iconName} className="glyph" size={12} />
			<span className="label">{label}</span>
			<Icon
				name="chevron"
				className="chev"
				size={10}
				style={open ? { transform: "rotate(180deg)" } : undefined}
			/>
		</button>
	);
}
