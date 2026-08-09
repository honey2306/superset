const _React = window.React;
export function Table({ children, className, ...rest }) {
	return (
		<table
			className={["ds-table", className].filter(Boolean).join(" ")}
			{...rest}
		>
			{children}
		</table>
	);
}
export function THead({ children }) {
	return <thead>{children}</thead>;
}
export function TBody({ children }) {
	return <tbody>{children}</tbody>;
}
export function TR({ children, onClick, active }) {
	return (
		<tr className={active ? "is-active" : undefined} onClick={onClick}>
			{children}
		</tr>
	);
}
export function TH({ children, align = "start", mono }) {
	return (
		<th className={[`a-${align}`, mono && "mono"].filter(Boolean).join(" ")}>
			{children}
		</th>
	);
}
export function TD({ children, align = "start", mono }) {
	return (
		<td className={[`a-${align}`, mono && "mono"].filter(Boolean).join(" ")}>
			{children}
		</td>
	);
}
