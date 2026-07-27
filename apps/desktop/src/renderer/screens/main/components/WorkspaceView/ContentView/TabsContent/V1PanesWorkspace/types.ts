/**
 * PoC pane data for the v2-panes-in-v1 mount.
 *
 * The `@superset/panes` engine is generic over `TData`; this is the minimal
 * shape the mount needs. `terminalId` mirrors v2's `TerminalPaneData` so the
 * M0–M5 neutral terminal layer (`HostServiceTerminalPane`) can consume it
 * without adaptation. `initialCommand` / `initialCwd` carry a preset's
 * launch command and working directory so a freshly-opened terminal pane
 * can start an agent (e.g. `claude`) on connect — `HostServiceTerminalPane`
 * forwards them to the host-service `createSession`.
 */
export interface V1PanesPaneData {
	terminalId: string;
	/** Shell command run once on session create (preset launch). */
	initialCommand?: string;
	/** Working directory for the session (preset cwd). */
	initialCwd?: string;
}
