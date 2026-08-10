import type { ReactNode } from "react";

/** File-row for the Changes list. Directory in muted, filename in fg, badge on right. */
export interface FileRowProps {
	dir: string;
	file: string;
	status?: "A" | "M" | "D" | "R";
	iconName?: string;
	trailing?: ReactNode;
	onClick?: () => void;
	className?: string;
}
export function FileRow(props: FileRowProps): JSX.Element;
