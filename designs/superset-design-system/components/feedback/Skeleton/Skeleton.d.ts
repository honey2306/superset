import type { CSSProperties } from "react";
/** Loading placeholder. Reads as `--hover` with a shimmer sweep; collapses to static under reduced-motion. */
export interface SkeletonProps {
	width?: CSSProperties["width"];
	height?: CSSProperties["height"];
	radius?: number;
	className?: string;
}
export function Skeleton(props: SkeletonProps): JSX.Element;
