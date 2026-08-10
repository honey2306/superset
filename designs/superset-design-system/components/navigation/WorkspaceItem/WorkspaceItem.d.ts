/**
 * Sidebar workspace / branch row. State drives the status-dot color:
 *   running → pink (accent), ok → green, warn → orange, err → red, idle → grey.
 */
export interface WorkspaceItemProps {
	name: string;
	state?: "running" | "ok" | "warn" | "err" | "idle";
	meta?: string;
	active?: boolean;
	onClick?: () => void;
	className?: string;
}
export function WorkspaceItem(props: WorkspaceItemProps): JSX.Element;
