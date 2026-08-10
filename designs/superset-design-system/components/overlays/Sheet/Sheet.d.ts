import type { ReactNode } from "react";

/**
 * Side-anchored panel. Slides in from left/right/top/bottom; the app itself
 * stays visible. Use for detail views that need more room than a Popover
 * but shouldn't cover the primary work area (PR detail, settings pane).
 * @startingPoint section="Overlays" subtitle="侧滑面板 · 4 方向 · 保留主区可见" viewport="400x580"
 */
export interface SheetProps {
	open: boolean;
	side?: "left" | "right" | "top" | "bottom";
	onClose?: () => void;
	title?: string;
	children: ReactNode;
	width?: number;
	className?: string;
}
export function Sheet(props: SheetProps): JSX.Element;
