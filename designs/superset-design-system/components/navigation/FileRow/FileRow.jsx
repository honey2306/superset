import { Badge } from "../../core/Badge/Badge.jsx";
import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;

const TONE = { A: "add", M: "mod", D: "del", R: undefined };

export function FileRow({
	dir,
	file,
	status,
	iconName = "file",
	trailing,
	onClick,
	className,
}) {
	return (
		<div
			className={["file-row", className].filter(Boolean).join(" ")}
			role="button"
			tabIndex={0}
			onClick={onClick}
		>
			<Icon name={iconName} className="glyph" size={13} />
			<span className="dir">{dir}</span>
			<span>{file}</span>
			{trailing}
			{status ? <Badge tone={TONE[status]}>{status}</Badge> : null}
		</div>
	);
}
