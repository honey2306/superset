import type { PaneDefinition } from "@superset/panes";
import { confirmCloseTerminals } from "renderer/lib/terminal/confirm-close-terminals";
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

/** Labels handed to `confirmCloseTerminals` for the close guard. */
export interface V1PanesCloseConfirmLabels {
	title: string;
	description: string;
	confirmLabel: string;
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
 *
 * `onBeforeClose` reuses v2's host-agnostic `confirmCloseTerminals`: it
 * probes `probeRunning` (a backend running-process check, injected) and
 * prompts when a process is still active. The probe keys by
 * `pane.data.terminalId` (the backend session id) — the running check is a
 * backend question. `onAfterClose` still kills by `pane.id` (the UI
 * identity the host-service adapter derives from).
 */
export interface V1PanesRegistryLifecycleDeps {
	terminalRuntime: V1PanesTerminalRuntime;
	killTerminal: (paneId: string) => void;
	/** Probes whether a foreground process is running in the terminal. */
	probeRunning: (terminalId: string) => Promise<boolean>;
	closeConfirmLabels: V1PanesCloseConfirmLabels;
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
 * session. `onBeforeClose` routes to `confirmCloseTerminals` with the
 * injected probe + labels so the close guard is the same host-agnostic
 * dialog v2 uses, without a v2 tRPC dependency.
 *
 * `renderPane` is added by `useV1PanesRegistry` (the hook) because it
 * depends on the Electron-only `HostServiceTerminalPane`.
 */
export function buildV1PanesLifecycleRegistry(
	deps: V1PanesRegistryLifecycleDeps,
): Pick<
	PaneDefinition<V1PanesPaneData>,
	"getTitle" | "titleSource" | "onBeforeClose" | "onAfterClose"
> {
	const { terminalRuntime, killTerminal, probeRunning, closeConfirmLabels } =
		deps;
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
		onBeforeClose: (pane) => {
			const { terminalId } = pane.data;
			return confirmCloseTerminals([terminalId], probeRunning, {
				...closeConfirmLabels,
			});
		},
		onAfterClose: (pane) => {
			killTerminal(pane.id);
		},
	};
}
