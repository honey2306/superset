import type { ReactElement, ReactNode } from "react";

/**
 * Rich hover preview. Distinct from Tooltip: HoverCard shows structured
 * content (thumbnail, meta, actions) instead of a plain label. Delay 300ms
 * on enter, 100ms on leave.
 */
export interface HoverCardProps {
	content: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	children: ReactElement;
	className?: string;
}
export function HoverCard(props: HoverCardProps): JSX.Element;
