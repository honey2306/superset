import { Icon } from "../../core/Icon/Icon.jsx";
import { IconButton } from "../../core/IconButton/IconButton.jsx";

const _React = window.React;

export function Sheet({
	open,
	side = "right",
	onClose,
	title,
	children,
	width = 400,
	className,
}) {
	if (!open) return null;
	const cls = ["ds-sheet", `s-${side}`, className].filter(Boolean).join(" ");
	return (
		<div className="ds-sheet-scrim" onClick={onClose}>
			<div
				className={cls}
				style={{ width }}
				role="dialog"
				aria-modal="true"
				onClick={(e) => e.stopPropagation()}
			>
				{title ? (
					<div className="ds-sheet-head">
						<div className="title">{title}</div>
						<IconButton onClick={onClose} aria-label="Close">
							<Icon name="x" size={13} />
						</IconButton>
					</div>
				) : null}
				<div className="ds-sheet-body">{children}</div>
			</div>
		</div>
	);
}
