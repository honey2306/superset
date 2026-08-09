import type { MouseEventHandler, ReactNode, Ref } from "react";

/**
 * Popover container. 340px wide by default; the caller positions it.
 * @startingPoint section="Overlays" subtitle="搜索式 popover · 分组行 · 键盘导航" viewport="360x460"
 */
export interface PopoverProps {
	children: ReactNode;
	className?: string;
	style?: React.CSSProperties;
}
export function Popover(props: PopoverProps): JSX.Element;

/** Search-style header row. `trailing` is a right-slot (e.g. a Kbd hint). */
export interface PopoverHeaderProps {
	iconName?: string;
	placeholder?: string;
	value?: string;
	onChange?: (next: string) => void;
	inputRef?: Ref<HTMLInputElement>;
	trailing?: ReactNode;
}
export function PopoverHeader(props: PopoverHeaderProps): JSX.Element;

export interface PopoverGroupProps {
	label: ReactNode;
	count?: number;
	action?: ReactNode;
}
export function PopoverGroup(props: PopoverGroupProps): JSX.Element;

export interface PopoverRowProps {
	iconName?: string;
	name: string;
	current?: boolean;
	focused?: boolean;
	tag?: ReactNode;
	end?: ReactNode;
	onClick?: () => void;
	onContextMenu?: MouseEventHandler<HTMLDivElement>;
	className?: string;
}
export function PopoverRow(props: PopoverRowProps): JSX.Element;

export function PopoverSep(): JSX.Element;
export function PopoverHint(props: { children: ReactNode }): JSX.Element;
