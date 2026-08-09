import { Icon } from "../../core/Icon/Icon.jsx";
import { Button } from "../../core/Button/Button.jsx";
const _React = window.React;

export function AlertDialog({
	open,
	title,
	body,
	confirmLabel = "Delete",
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
}) {
	if (!open) return null;
	return (
		<div className="ds-dialog-scrim" onClick={onCancel}>
			<div
				className="ds-alert-dialog"
				role="alertdialog"
				aria-modal="true"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="icon">
					<Icon name="alert" size={16} />
				</div>
				<div className="title">{title}</div>
				<div className="body">{body}</div>
				<div className="actions">
					<Button onClick={onCancel}>{cancelLabel}</Button>
					<Button variant="danger" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
