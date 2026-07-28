/**
 * PoC pane data for the v2-panes-in-v1 mount.
 *
 * The `@superset/panes` engine is generic over `TData`; this is the minimal
 * shape the mount needs. `terminalId` mirrors v2's `TerminalPaneData` so the
 * M0–M5 neutral terminal layer (`HostServiceTerminalPane`) can consume it
 * without adaptation. `initialCommand` is reserved for ordinary presets and
 * compatibility fallback when a host agent is unavailable; built-in agents
 * use the formal host-service `agents.run` route before their pane mounts.
 */
export interface V1PanesPaneData extends HostServiceTerminalPaneSnapshot {
	terminalId: string;
	status?: PaneStatus;
	cwdConfirmed?: boolean;
	/** Shell command run once on session create (preset launch). */
	initialCommand?: string;
	/** Working directory for the session (preset cwd). */
	initialCwd?: string;
}

import type { PaneStatus } from "shared/tabs-types";
import type { HostServiceTerminalPaneSnapshot } from "../Terminal/host-service-terminal-pane-bridge";
