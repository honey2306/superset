import type { SVGProps } from "react";

export type IconName =
	| "branch"
	| "chevron"
	| "search"
	| "plus"
	| "check"
	| "refresh"
	| "push"
	| "pull"
	| "merge"
	| "arrowRight"
	| "edit"
	| "copy"
	| "terminal"
	| "trash"
	| "alert"
	| "file"
	| "cloud"
	| "changes"
	| "max"
	| "x"
	| "sort"
	| "moreH"
	| "spark";

/**
 * Line-icon primitive. 24×24 viewbox, stroke=currentColor so a parent tint
 * (via CSS `color`) cascades. Default size 14px matches dense UI density.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
	name: IconName;
	size?: number;
}

export function Icon(props: IconProps): JSX.Element;
