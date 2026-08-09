import type { ChangeEventHandler, ReactNode } from "react";

/**
 * Radio row. Use in a `<RadioGroup>`-style parent (or a plain wrapping div) where
 * every `<Radio>` shares the same `name`. Mirrors [[Checkbox]] visually: 14px dot,
 * accent-tinted when checked, 1.5px hairline ring otherwise.
 */
export interface RadioProps {
	name?: string;
	value?: string;
	checked?: boolean;
	defaultChecked?: boolean;
	onChange?: ChangeEventHandler<HTMLInputElement>;
	children?: ReactNode;
	className?: string;
}
export function Radio(props: RadioProps): JSX.Element;
