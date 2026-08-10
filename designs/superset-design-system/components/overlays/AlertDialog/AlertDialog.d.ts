import type { ReactNode } from "react";

/**
 * Destructive confirm dialog — full modal variant of `ConfirmCard`. Use
 * when the destructive path can't be anchored (bulk delete, sign out).
 * @startingPoint section="Overlays" subtitle="全屏破坏性确认 · scrim + shadow-3" viewport="420x260"
 */
export interface AlertDialogProps {
	open: boolean;
	title: string;
	body: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm?: () => void;
	onCancel?: () => void;
}
export function AlertDialog(props: AlertDialogProps): JSX.Element;
