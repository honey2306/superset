import type { ChangeEventHandler, ReactNode } from "react";

/** Row-style checkbox with the label to the right; use inside inline forms. */
export interface CheckboxProps {
	checked?: boolean;
	defaultChecked?: boolean;
	onChange?: ChangeEventHandler<HTMLInputElement>;
	children: ReactNode;
	className?: string;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
