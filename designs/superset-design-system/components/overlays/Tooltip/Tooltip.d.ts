import type { ReactElement, ReactNode } from "react";

/**
 * Hover/focus tooltip. Wrap a single interactive element and pass the label;
 * the tooltip attaches `aria-describedby` and shows on hover + focus, dismisses
 * on blur + mouseleave. Explanations for disabled items ("无法合并到自身",
 * "已在此分支") belong here, not in the row itself.
 */
export interface TooltipProps {
	label: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	children: ReactElement;
	className?: string;
}
export function Tooltip(props: TooltipProps): JSX.Element;
