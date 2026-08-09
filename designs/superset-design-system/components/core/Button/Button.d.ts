import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Pill-shaped button. `primary` uses accent tint (never full pink fill —
 * the pink stays as tint/border only, per Dracula system). `danger` uses
 * red tint. `ghost` is transparent, no border. `default` is neutral outline.
 */
export interface ButtonProps
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
	variant?: "primary" | "default" | "ghost" | "danger";
	size?: "md" | "sm";
	children?: ReactNode;
	className?: string;
}

export function Button(props: ButtonProps): JSX.Element;
