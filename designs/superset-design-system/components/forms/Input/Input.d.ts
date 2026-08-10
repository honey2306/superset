import type { InputHTMLAttributes, ReactNode, Ref } from "react";

/**
 * Text input framed as a label: optional leading Icon (name), the input, then
 * an optional trailing slot (Kbd hint, spinner, clear). `transparent` drops
 * the fill and shows a bottom hairline — used inside popover headers.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	iconName?: string;
	trailing?: ReactNode;
	transparent?: boolean;
	inputRef?: Ref<HTMLInputElement>;
	className?: string;
}

export function Input(props: InputProps): JSX.Element;
