const _React = window.React;
const { useState, useRef } = window.React;

export function HoverCard({ content, side = "bottom", children, className }) {
	const [open, setOpen] = useState(false);
	const openT = useRef(null);
	const closeT = useRef(null);
	const trigger = _React.Children.only(children);
	const enter = () => {
		clearTimeout(closeT.current);
		openT.current = setTimeout(() => setOpen(true), 300);
	};
	const leave = () => {
		clearTimeout(openT.current);
		closeT.current = setTimeout(() => setOpen(false), 100);
	};
	const cloned = _React.cloneElement(trigger, {
		onMouseEnter: (e) => {
			trigger.props.onMouseEnter?.(e);
			enter();
		},
		onMouseLeave: (e) => {
			trigger.props.onMouseLeave?.(e);
			leave();
		},
	});
	return (
		<span className="ds-hover-card-wrap">
			{cloned}
			{open ? (
				<span
					className={["ds-hover-card", `s-${side}`, className]
						.filter(Boolean)
						.join(" ")}
					onMouseEnter={enter}
					onMouseLeave={leave}
				>
					{content}
				</span>
			) : null}
		</span>
	);
}
