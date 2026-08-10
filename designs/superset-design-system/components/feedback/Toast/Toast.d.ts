import type { ReactNode } from "react";

/** Corner toast for action feedback. Auto-dismiss is caller's responsibility. */
export interface ToastProps {
	tone?: "success" | "info" | "warn" | "error";
	iconName?: string;
	children: ReactNode;
	className?: string;
}
export function Toast(props: ToastProps): JSX.Element;
