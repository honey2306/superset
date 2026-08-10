import type { ReactNode } from "react";

/**
 * Mono badge for file-status letters (A/M/D/R) or a `pill` variant for
 * "当前" / role labels. Text stays 1–2 chars for file status.
 */
export interface BadgeProps {
	tone?: "add" | "mod" | "del";
	pill?: boolean;
	children: ReactNode;
	className?: string;
}

export function Badge(props: BadgeProps): JSX.Element;
