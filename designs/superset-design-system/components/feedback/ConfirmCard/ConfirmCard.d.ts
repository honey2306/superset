import type { ReactNode } from "react";

/**
 * Small confirm dialog anchored at a point (not a full-screen modal).
 * Enter → confirm, Esc → cancel (wire in the caller). Use `danger` for
 * destructive confirms (delete branch, drop workspace).
 * @startingPoint section="Overlays" subtitle="就地确认卡 · 危险动作" viewport="340x240"
 */
export interface ConfirmCardProps {
	title: string;
	body: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
	onConfirm?: () => void;
	onCancel?: () => void;
	className?: string;
}
export function ConfirmCard(props: ConfirmCardProps): JSX.Element;
