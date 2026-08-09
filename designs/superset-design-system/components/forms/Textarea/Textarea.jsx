const _React = window.React;
export function Textarea({ resize = "vertical", className, ...rest }) {
	const cls = ["ds-textarea", `r-${resize}`, className].filter(Boolean).join(" ");
	return <textarea className={cls} {...rest} />;
}
