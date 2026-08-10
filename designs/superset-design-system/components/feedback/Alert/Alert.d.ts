import type { ReactNode } from "react";
/** Inline banner. Not a toast (no auto-dismiss); use where the user can act on it in place. */
export interface AlertProps {
	tone?: "info" | "success" | "warning" | "danger";
	title?: string;
	children: ReactNode;
	className?: string;
}
export function Alert(props: AlertProps): JSX.Element;
