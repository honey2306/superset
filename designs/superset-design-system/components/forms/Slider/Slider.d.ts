/** Range slider. 2px track, accent-tint fill up to thumb, 12px pink thumb. */
export interface SliderProps {
	value?: number;
	defaultValue?: number;
	min?: number;
	max?: number;
	step?: number;
	onChange?: (value: number) => void;
	className?: string;
}
export function Slider(props: SliderProps): JSX.Element;
