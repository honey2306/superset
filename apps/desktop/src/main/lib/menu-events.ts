import { EventEmitter } from "node:events";
export type SettingsSection =
	| "project"
	| "workspace"
	| "appearance"
	| "keyboard"
	| "behavior"
	| "git"
	| "terminal";

export interface OpenSettingsEvent {
	section?: SettingsSection;
}

export interface OpenWorkspaceEvent {
	workspaceId: string;
}

export const menuEmitter = new EventEmitter();
