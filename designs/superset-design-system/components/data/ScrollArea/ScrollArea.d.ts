import type { ReactNode } from "react";
/** Constrained scroll region with themed thin scrollbar (matches app's global --scrollbar). */
export interface ScrollAreaProps {
	children: ReactNode;
	maxHeight?: number | string;
	className?: string;
}
export function ScrollArea(props: ScrollAreaProps): JSX.Element;
