import { Button } from "../../core/Button/Button.jsx";
import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

export function ConfirmCard({
	title,
	body,
	confirmLabel = "确认",
	cancelLabel = "取消",
	danger,
	onConfirm,
	onCancel,
	className,
}) {
	return (
		<div className={["confirm", className].filter(Boolean).join(" ")}>
			<div className="icon">
				<Icon name="alert" size={16} />
			</div>
			<h3 className="title">{title}</h3>
			<div className="body">{body}</div>
			<div className="actions">
				<Button onClick={onCancel}>{cancelLabel}</Button>
				<Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</div>
	);
}
