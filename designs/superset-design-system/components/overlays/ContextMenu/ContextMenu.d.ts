import type { ReactNode } from "react";

/**
 * Context-menu container. The caller positions it at fixed coordinates.
 * @startingPoint section="Overlays" subtitle="右键聚合动作 · heading / group / sep / item" viewport="300x360"
 */
export interface ContextMenuProps {
	children: ReactNode;
	className?: string;
	style?: React.CSSProperties;
}
export function ContextMenu(props: ContextMenuProps): JSX.Element;

export interface MenuHeadingProps {
	iconName?: string;
	title: string;
	badge?: ReactNode;
}
export function MenuHeading(props: MenuHeadingProps): JSX.Element;

export function MenuSep(): JSX.Element;
export function MenuGroup(props: { children: ReactNode }): JSX.Element;

export interface MenuItemProps {
	iconName?: string;
	label: ReactNode;
	danger?: boolean;
	disabled?: boolean;
	kbd?: ReactNode;
	tag?: ReactNode;
	title?: string;
	onClick?: () => void;
}
export function MenuItem(props: MenuItemProps): JSX.Element;
