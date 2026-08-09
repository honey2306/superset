import type { ReactNode } from "react";

/**
 * Dropdown menu — click-triggered variant of [[ContextMenu]]. Visually
 * identical (same 30px rows, 10px radius, backdrop-blur), but anchored to
 * a button/pill trigger instead of a right-click position. Use for Options
 * pickers ("View mode", "Branch actions" cog).
 * @startingPoint section="Overlays" subtitle="点击触发 · 与 ContextMenu 同一密度" viewport="240x360"
 */
export interface DropdownMenuProps {
	trigger: ReactNode;
	children: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
}
export function DropdownMenu(props: DropdownMenuProps): JSX.Element;
