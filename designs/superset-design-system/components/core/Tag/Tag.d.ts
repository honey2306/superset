import type { ReactNode } from "react";

/**
 * ahead/behind tag. `dir="up"` prefixes ↑ (success tone), `dir="down"` prefixes
 * ↓ (warning tone). Plain (`dir` omitted) is neutral (e.g. "origin").
 */
export interface TagProps {
	dir?: "up" | "down";
	children: ReactNode;
	className?: string;
}

export function Tag(props: TagProps): JSX.Element;
