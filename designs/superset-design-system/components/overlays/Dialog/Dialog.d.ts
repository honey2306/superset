import type { ReactNode } from "react";

/**
 * Modal dialog. Full page scrim, 12px radius, shadow-3. Use for
 * non-destructive multi-field flows (New workspace, Settings pane). For
 * simple yes/no confirms use `ConfirmCard`, for row-level actions use
 * `Popover`.
 * @startingPoint section="Overlays" subtitle="模态窗 · 12px radius · shadow-3 · scrim" viewport="560x420"
 */
export interface DialogProps {
	open: boolean;
	onClose?: () => void;
	width?: number;
	children: ReactNode;
	className?: string;
}
export function Dialog(props: DialogProps): JSX.Element;

export interface DialogHeaderProps {
	title: string;
	description?: ReactNode;
	onClose?: () => void;
}
export function DialogHeader(props: DialogHeaderProps): JSX.Element;

export interface DialogFooterProps {
	children: ReactNode;
}
export function DialogFooter(props: DialogFooterProps): JSX.Element;
