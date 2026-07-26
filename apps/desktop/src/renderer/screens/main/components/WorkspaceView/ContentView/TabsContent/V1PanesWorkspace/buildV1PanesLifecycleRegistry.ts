import type { PaneDefinition } from "@superset/panes";
import type { V1PanesPaneData } from "./types";

/**
 * The slice of `terminalRuntimeRegistry` the lifecycle registry uses. Held
 * as a type so the dependency can be injected without importing the real
 * registry (whose module graph pulls the Electron tRPC client at load
 * time, which is unavailable in non-Electron tests).
 */
export interface V1PanesTerminalRuntime {
	onTitleChange: (
		terminalId: string,
		callback: () => void,
		instanceId: string,
	) => () => void;
	getTitle: (
		terminalId: string,
		instanceId: string,
	) => string | null | undefined;
}

/**
 * Dependencies the v1-panes-in-v1 registry lifecycle needs.
 *
 * Both are injected (rather than imported at module top level) so this
 * builder has no Electron-only module dependencies and can load in a
 * non-Electron test environment. The hook wires the real
 * `terminalRuntimeRegistry` and `killTerminalForPane` here; tests pass
 * stubs/spies.
 *
 * `renderPane` is intentionally NOT part of this lifecycle builder: it
 * renders `HostServiceTerminalPane`, whose module imports the Electron
 * tRPC client at load time. The hook layers `renderPane` on top.
 */
export interface V1PanesRegistryLifecycleDeps {
	terminalRuntime: V1PanesTerminalRuntime;
	killTerminal: (paneId: string) => void;
}

/**
 * Build the lifecycle slice of the v1-panes-in-v1 terminal registry.
 *
 * Terminal-only. `getTitle`/`titleSource` reuse the M0–M5 neutral
 * `terminalRuntimeRegistry` (injected) so titles stay live without a v2
 * provider. `onAfterClose` routes to the injected `killTerminal` keyed by
 * `pane.id` (the UI identity), NOT `pane.data.terminalId` (the backend
 * identity): `HostServiceTerminalPane` derives its terminalId from paneId,
 * so the kill must be keyed the same way to reach the right host-service
 * session.
 *
 * `renderPane` is added by `useV1PanesRegistry` (the hook) because it
 * depends on the Electron-only `HostServiceTerminalPane`.
 */
export function buildV1PanesLifecycleRegistry(
	deps: V1PanesRegistryLifecycleDeps,
): Pick<
	PaneDefinition<V1PanesPaneData>,
	"getTitle" | "titleSource" | "onAfterClose"
> {
	const { terminalRuntime, killTerminal } = deps;
	return {
		getTitle: () => "Terminal",
		titleSource: (pane) => {
			const { terminalId } = pane.data;
			const instanceId = pane.id;
			return {
				subscribe: (callback) =>
					terminalRuntime.onTitleChange(terminalId, callback, instanceId),
				getSnapshot: () =>
					terminalRuntime.getTitle(terminalId, instanceId)?.trim() || undefined,
			};
		},
		onAfterClose: (pane) => {
			killTerminal(pane.id);
		},
	};
}
