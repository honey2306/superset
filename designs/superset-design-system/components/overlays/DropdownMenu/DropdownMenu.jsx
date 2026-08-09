const _React = window.React;
const { useState, useRef, useEffect } = window.React;

export function DropdownMenu({ trigger, children, side = "bottom", align = "start" }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef(null);
	useEffect(() => {
		if (!open) return;
		const off = (e) => {
			if (!wrapRef.current?.contains(e.target)) setOpen(false);
		};
		document.addEventListener("mousedown", off);
		return () => document.removeEventListener("mousedown", off);
	}, [open]);
	const t = _React.cloneElement(_React.Children.only(trigger), {
		onClick: () => setOpen((v) => !v),
		"aria-expanded": open,
	});
	return (
		<span className="ds-dropdown-wrap" ref={wrapRef}>
			{t}
			{open ? (
				<span className={`ds-dropdown s-${side} a-${align}`}>{children}</span>
			) : null}
		</span>
	);
}
