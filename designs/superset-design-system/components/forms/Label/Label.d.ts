import type { ReactNode } from "react";
/** Form-field label. 10px eyebrow uppercase for compact forms; body case for prompt fields. */
export interface LabelProps {
	htmlFor?: string;
	required?: boolean;
	children: ReactNode;
	className?: string;
}
export function Label(props: LabelProps): JSX.Element;
