import type { ReactNode } from "react";
/**
 * Empty state. Use when a list/panel is intentionally empty and the user
 * should do something to fill it (not "loading" — use Skeleton for that).
 * @startingPoint section="Patterns" subtitle="缺省态 · 图标 halo · 标题 · 描述 · CTA" viewport="360x220"
 */
export interface EmptyProps {
	iconName?: string;
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}
export function Empty(props: EmptyProps): JSX.Element;
