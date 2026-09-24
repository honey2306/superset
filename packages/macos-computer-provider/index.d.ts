export type MacOSSpaceInfo = {
	number: number;
	id: string;
	type: "user" | "fullscreen" | "system" | "tiled" | "unknown";
	isActive: boolean;
	name?: string;
	ownerPids: number[];
};

export type MacOSDockItem = {
	index: number;
	title: string;
	role?: string;
	subrole?: string;
	type:
		| "application"
		| "folder"
		| "file"
		| "url"
		| "minimized-window"
		| "trash"
		| "separator"
		| "unknown";
	isRunning?: boolean;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
};

export type NativeMutationResult = {
	dispatched: boolean;
	changed?: boolean;
	confirmed?: boolean;
	before?: unknown;
	after?: unknown;
};

export function isAvailable(): boolean;
export function listSpaces(): MacOSSpaceInfo[];
export function spacesForWindow(windowId: number): string[];
export function switchSpace(spaceId: string): NativeMutationResult;
export function moveWindowToSpace(
	windowId: number,
	spaceId: string,
): NativeMutationResult;
export function windowAction(
	pid: number,
	windowId: number,
	action: "close" | "minimize" | "restore" | "maximize",
): NativeMutationResult;
export function appAction(
	pid: number,
	action: "terminate" | "force-terminate" | "hide" | "unhide" | "activate",
): NativeMutationResult;
export function listDockItems(includeAll?: boolean): MacOSDockItem[];
export function dockAction(
	name: string,
	action: "launch" | "show-menu",
	menuItem?: string,
): NativeMutationResult;
export function isDockHidden(): boolean;
export function setDockHidden(hidden: boolean): NativeMutationResult;
export function saveClipboard(): string;
export function restoreClipboard(token: string): boolean;
