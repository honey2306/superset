import type { ReactNode } from "react";

/**
 * Small status chip: a dot + a label. Use inside file-summary rows or the
 * status bar. `tone` colors the dot; text stays neutral.
 */
export interface ChipProps {
	tone?: "add" | "mod" | "del";
	children: ReactNode;
	className?: string;
}

export function Chip(props: ChipProps): JSX.Element;
