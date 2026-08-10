import { Icon } from "../../core/Icon/Icon.jsx";

const _React = window.React;
export function Breadcrumb({ items, className, ...rest }) {
	return (
		<nav
			className={["ds-breadcrumb", className].filter(Boolean).join(" ")}
			aria-label="Breadcrumb"
			{...rest}
		>
			{items.map((it, i) => (
				<_React.Fragment key={i}>
					<span
						className={i === items.length - 1 ? "seg is-last" : "seg"}
						onClick={it.onClick}
					>
						{it.label}
					</span>
					{i < items.length - 1 ? (
						<Icon name="chevron" size={9} className="sep" />
					) : null}
				</_React.Fragment>
			))}
		</nav>
	);
}
