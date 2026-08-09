import { Icon } from "../../core/Icon/Icon.jsx";
const _React = window.React;

const ICON = { info: "cloud", success: "check", warning: "alert", danger: "alert" };

export function Alert({ tone = "info", title, children, className, ...rest }) {
	const cls = ["ds-alert", tone, className].filter(Boolean).join(" ");
	return (
		<div className={cls} role={tone === "danger" ? "alert" : "status"} {...rest}>
			<Icon name={ICON[tone]} className="glyph" size={14} />
			<div className="body">
				{title ? <div className="title">{title}</div> : null}
				<div className="msg">{children}</div>
			</div>
		</div>
	);
}
