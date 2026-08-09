import type { ReactNode } from "react";

/** Keyboard chord label, e.g. ⌘K, Esc. */
export interface KbdProps {
	children: ReactNode;
	className?: string;
}
export function Kbd(props: KbdProps): JSX.Element;
