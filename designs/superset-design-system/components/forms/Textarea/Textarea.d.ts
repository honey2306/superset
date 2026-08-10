import type { TextareaHTMLAttributes } from "react";
/** Multiline input. Same visual base as Input (hairline + focus pink glow). */
export interface TextareaProps
	extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	resize?: "none" | "vertical";
}
export function Textarea(props: TextareaProps): JSX.Element;
