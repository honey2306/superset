/**
 * Indeterminate loading indicator — 1.5px conic ring, rotates at 900ms.
 * Reduced-motion collapses the animation to a static ring. `tone="accent"`
 * paints the ring pink; default is muted foreground. Use only for foreground
 * "waiting on this action" states; row-level running status uses [[WorkspaceItem]]'s dot.
 */
export interface SpinnerProps {
	size?: number;
	tone?: "accent" | "success" | "danger";
	className?: string;
}
export function Spinner(props: SpinnerProps): JSX.Element;
