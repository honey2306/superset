import type { ReactNode } from "react";
/**
 * Collapsible section — one item accordion. Header row 30px, chevron
 * rotates to indicate open; body inherits the panel's padding.
 */
export interface CollapsibleProps {
	title: string;
	iconName?: string;
	count?: number;
	defaultOpen?: boolean;
	children: ReactNode;
	className?: string;
}
export function Collapsible(props: CollapsibleProps): JSX.Element;
