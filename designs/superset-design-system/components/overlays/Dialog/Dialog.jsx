import { Icon } from "../../core/Icon/Icon.jsx";
import { IconButton } from "../../core/IconButton/IconButton.jsx";

const _React = window.React;

export function Dialog({ open, onClose, width = 560, children, className }) {
	if (!open) return null;
	return (
		<div className="ds-dialog-scrim" onClick={onClose}>
			<div
				className={["ds-dialog", className].filter(Boolean).join(" ")}
				style={{ width }}
				role="dialog"
				aria-modal="true"
				onClick={(e) => e.stopPropagation()}
			>
				{children}
			</div>
		</div>
	);
}

export function DialogHeader({ title, description, onClose }) {
	return (
		<div className="ds-dialog-head">
			<div className="titles">
				<div className="title">{title}</div>
				{description ? <div className="desc">{description}</div> : null}
			</div>
			{onClose ? (
				<IconButton onClick={onClose} aria-label="Close">
					<Icon name="x" size={14} />
				</IconButton>
			) : null}
		</div>
	);
}

export function DialogFooter({ children }) {
	return <div className="ds-dialog-foot">{children}</div>;
}
