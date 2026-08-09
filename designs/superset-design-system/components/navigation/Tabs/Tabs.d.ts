import type { ReactNode } from "react";

/** Section tabs with an underline for the active one. */
export interface TabItem {
	value: string;
	label: ReactNode;
	iconName?: string;
}
export interface TabsProps {
	items: TabItem[];
	value: string;
	onChange?: (next: string) => void;
	trailing?: ReactNode;
	className?: string;
}
export function Tabs(props: TabsProps): JSX.Element;
