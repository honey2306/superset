/**
 * Rounded pill trigger — the branch-menu opener, but reusable as any
 * "opens a popover" affordance. Icon on the left, mono label, chevron on
 * the right that rotates 180° when `open`.
 */
export interface PillProps {
	label: string;
	open?: boolean;
	iconName?: string;
	onClick?: () => void;
	className?: string;
}

export function Pill(props: PillProps): JSX.Element;
