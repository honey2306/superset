import type { PaneDefinition } from "@superset/panes";
import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { confirmCloseTerminals } from "renderer/lib/terminal/confirm-close-terminals";
import type { PanesPaneData } from "./types";

/**
 * The slice of `terminalRuntimeRegistry` the lifecycle registry uses. Held
 * as a type so the dependency can be injected without importing the real
 * registry (whose module graph pulls the Electron tRPC client at load
 * time, which is unavailable in non-Electron tests).
 */
export interface PanesTerminalRuntime {
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
export interface PanesCloseConfirmLabels {
	title: string;
	description: string;
	confirmLabel: string;
}

/**
 * Dependencies the Host-backed panes registry lifecycle needs.
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
 * backend question. `onAfterClose` supplies both `pane.id` (UI identity)
 * and the persisted terminal id so callers can clean up mounted or never-
 * mounted host sessions.
 */
export interface PanesRegistryLifecycleDeps {
	terminalRuntime: PanesTerminalRuntime;
	killTerminal: (paneId: string, terminalId: string) => void;
	/** Probes whether a foreground process is running in the terminal. */
	probeRunning: (terminalId: string) => Promise<boolean>;
	closeConfirmLabels: PanesCloseConfirmLabels;
}

/**
 * Build the lifecycle slice of the Host-backed panes terminal registry.
 *
 * Terminal-only. `getTitle`/`titleSource` reuse the M0–M5 neutral
 * `terminalRuntimeRegistry` (injected) so titles stay live without a v2
 * provider. `onAfterClose` routes both the pane and backend identities to
 * the injected `killTerminal`, allowing registered mounted-pane cleanup first
 * and a direct host-session fallback when the pane never mounted.
 * `onBeforeClose` routes to `confirmCloseTerminals` with the injected probe +
 * labels so the close guard is the same host-agnostic
 * dialog v2 uses, without a v2 tRPC dependency.
 *
 * `renderPane` is added by `usePanesRegistry` (the hook) because it
 * depends on the Electron-only `HostServiceTerminalPane`.
 */
export function buildPanesLifecycleRegistry(
	deps: PanesRegistryLifecycleDeps,
): Pick<
	PaneDefinition<PanesPaneData>,
	"getTitle" | "titleSource" | "onBeforeClose" | "onAfterClose"
> {
	const { terminalRuntime, killTerminal, probeRunning, closeConfirmLabels } =
		deps;
	return {
		getTitle: () => "Terminal",
		titleSource: (pane) => {
			const terminalId = pane.data.terminalId ?? "";
			const instanceId = pane.id;
			return {
				subscribe: (callback) =>
					terminalRuntime.onTitleChange(terminalId, callback, instanceId),
				getSnapshot: () =>
					terminalRuntime.getTitle(terminalId, instanceId)?.trim() || undefined,
			};
		},
		onBeforeClose: (pane) => {
			const terminalId = pane.data.terminalId ?? "";
			return confirmCloseTerminals([terminalId], probeRunning, {
				...closeConfirmLabels,
			});
		},
		onAfterClose: (pane) => {
			killTerminal(pane.id, pane.data.terminalId ?? pane.id);
		},
	};
}

export function buildPanesAcpLifecycleRegistry(): Pick<
	PaneDefinition<PanesPaneData>,
	"getTitle" | "onBeforeClose" | "onAfterClose"
> {
	return {
		getTitle: (pane) => {
			const acp = pane.data.acp;
			return (
				acp?.title ??
				(acp ? BUILTIN_AGENT_LABELS[acp.agentDefinitionId] : "Claude")
			);
		},

		// Pane close only detaches the presentation. ACP sessions remain owned by
		// the host and may be reopened explicitly; close/cancel/delete are separate
		// user actions and must never be inferred from UI teardown.
		onBeforeClose: () => true,
		onAfterClose: () => {},
	};
}
