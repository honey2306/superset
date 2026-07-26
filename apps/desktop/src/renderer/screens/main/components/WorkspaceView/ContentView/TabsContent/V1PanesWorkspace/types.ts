/**
 * PoC pane data for the v2-panes-in-v1 mount.
 *
 * The `@superset/panes` engine is generic over `TData`; this is the minimal
 * shape the PoC needs. `terminalId` mirrors v2's `TerminalPaneData` so the
 * M0–M5 neutral terminal layer (`HostServiceTerminalPane`) can consume it
 * without adaptation.
 */
export interface V1PanesPaneData {
	terminalId: string;
}
