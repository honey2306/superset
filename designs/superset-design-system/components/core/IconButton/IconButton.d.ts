import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 24×24 icon-only button with hover tint. Wrap any Icon inside. Always give it
 * a `title` for a11y — the icon-only surface has no visible label.
 */
export interface IconButtonProps
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
	children?: ReactNode;
	className?: string;
}

export function IconButton(props: IconButtonProps): JSX.Element;
