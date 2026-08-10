const _React = window.React;

const TONE = {
	running: "",
	ok: "ok",
	err: "err",
	warn: "",
	idle: "idle",
};

export function WorkspaceItem({
	name,
	state = "idle",
	meta,
	active,
	onClick,
	className,
}) {
	const cls = ["ws-item", active && "is-active", className]
		.filter(Boolean)
		.join(" ");
	return (
		<button className={cls} onClick={onClick} type="button">
			<span className={`status-dot ${TONE[state] ?? ""}`} />
			<span className="name">{name}</span>
			{meta ? <span className="meta">{meta}</span> : null}
		</button>
	);
}
