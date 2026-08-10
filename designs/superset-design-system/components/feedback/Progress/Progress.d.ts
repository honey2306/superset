/** Determinate progress bar. 2px track hairline, 2px fill in accent. */
export interface ProgressProps {
	value: number;
	max?: number;
	tone?: "accent" | "success" | "danger";
	className?: string;
}
export function Progress(props: ProgressProps): JSX.Element;
