import type { ReactNode } from "react";

/** Pill-shaped segmented control. Use for 2–4 mutually exclusive filters. */
export interface SegmentedOption {
	value: string;
	label: ReactNode;
}
export interface SegmentedControlProps {
	options: Array<string | SegmentedOption>;
	value: string;
	onChange?: (next: string) => void;
	className?: string;
}
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
