const _React = window.React;
export function Skeleton({ width, height, radius = 4, className, ...rest }) {
	return (
		<span
			className={["ds-skeleton", className].filter(Boolean).join(" ")}
			style={{ width, height, borderRadius: radius }}
			{...rest}
		/>
	);
}
