import type { AddFileViewerPaneOptions } from "renderer/stores/tabs/types";
import type { PaneStatus } from "shared/tabs-types";

export interface HostServiceTerminalPaneSnapshot {
	initialCwd?: string;
	cwd?: string | null;
	workspaceRun?: {
		workspaceId: string;
		state: "running" | "stopped-by-user" | "stopped-by-exit";
		command?: string;
	};
	lifecycleScript?: {
		kind: "setup" | "teardown";
		state: "running" | "succeeded" | "failed";
		exitCode?: number;
	};
}

/**
 * UI-host adapter for the neutral host-service terminal.
 *
 * The legacy mosaic host continues to use the v1 tabs store directly. The
 * @superset/panes host supplies this bridge so title/status/cwd/exit writes
 * target its per-workspace store instead of silently mutating the hidden
 * legacy store.
 */
export interface HostServiceTerminalPaneBridge {
	isFocused: boolean;
	getSnapshot(): HostServiceTerminalPaneSnapshot | null;
	isDestroyed(): boolean;
	setTitle(title: string): void;
	setStatus(status: PaneStatus): void;
	setCwd(cwd: string | null, confirmed: boolean): void;
	setWorkspaceRunState(
		state: "running" | "stopped-by-user" | "stopped-by-exit",
	): void;
	setLifecycleScript(
		script: NonNullable<HostServiceTerminalPaneSnapshot["lifecycleScript"]>,
	): void;
	clearInitialData(): void;
	openFileViewer(options: AddFileViewerPaneOptions): void;
	close(): void;
}
