import type { ReactNode } from "react";
/**
 * Dense data table. 30px row height, hairline column separators only,
 * mono for any numeric column (counts, sizes, ports), body font for text.
 * Header row uses `--fg-mute` eyebrow-cased labels.
 */
export interface TableProps {
	children: ReactNode;
	className?: string;
}
export function Table(props: TableProps): JSX.Element;
export function THead(props: { children: ReactNode }): JSX.Element;
export function TBody(props: { children: ReactNode }): JSX.Element;
export function TR(props: { children: ReactNode; onClick?: () => void; active?: boolean }): JSX.Element;
export function TH(props: { children: ReactNode; align?: "start" | "end" | "center"; mono?: boolean }): JSX.Element;
export function TD(props: { children: ReactNode; align?: "start" | "end" | "center"; mono?: boolean }): JSX.Element;
