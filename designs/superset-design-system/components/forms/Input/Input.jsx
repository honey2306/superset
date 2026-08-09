import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

export function Input({
	iconName,
	trailing,
	transparent,
	className,
	inputRef,
	...inputProps
}) {
	const cls = ["input", transparent && "transparent", className]
		.filter(Boolean)
		.join(" ");
	return (
		<label className={cls}>
			{iconName ? <Icon name={iconName} className="glyph" size={13} /> : null}
			<input ref={inputRef} {...inputProps} />
			{trailing}
		</label>
	);
}
