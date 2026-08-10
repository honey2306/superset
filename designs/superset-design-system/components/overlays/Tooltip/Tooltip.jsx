const _React = window.React;
const { useId, useState } = window.React;

export function Tooltip({ label, side = "top", children, className, ...rest }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	const trigger = _React.Children.only(children);
	const cloned = _React.cloneElement(trigger, {
		"aria-describedby": open ? id : undefined,
		onMouseEnter: (e) => {
			trigger.props.onMouseEnter?.(e);
			setOpen(true);
		},
		onMouseLeave: (e) => {
			trigger.props.onMouseLeave?.(e);
			setOpen(false);
		},
		onFocus: (e) => {
			trigger.props.onFocus?.(e);
			setOpen(true);
		},
		onBlur: (e) => {
			trigger.props.onBlur?.(e);
			setOpen(false);
		},
	});
	const cls = ["tooltip", `s-${side}`, className].filter(Boolean).join(" ");
	return (
		<span className="tooltip-wrap">
			{cloned}
			{open ? (
				<span role="tooltip" id={id} className={cls} {...rest}>
					{label}
				</span>
			) : null}
		</span>
	);
}
