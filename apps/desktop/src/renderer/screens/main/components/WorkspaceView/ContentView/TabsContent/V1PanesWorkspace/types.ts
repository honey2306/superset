import type {
	BrowserPaneState,
	CommentPaneState,
	DevToolsPaneState,
	PaneStatus,
} from "shared/tabs-types";
import type { HostServiceTerminalPaneSnapshot } from "../Terminal/host-service-terminal-pane-bridge";

/**
 * Pane data for the v2-panes-in-v1 mount.
 *
 * The `@superset/panes` engine is generic over `TData`; the store is
 * generic over one `TData` for all pane kinds. We keep a single flat
 * interface (mirroring v1's `Pane` shape) and discriminate by
 * `pane.kind`. Each kind's fields stay optional so the registry can
 * branch on `kind` and narrow via a runtime check, without forcing a
 * discriminated union that would break the single-`TData` store generic.
 *
 * Terminal fields are the baseline (the M0–M5 neutral terminal layer
 * consumes them). `initialCommand` is reserved for ordinary presets and
 * compatibility fallback when a host agent is unavailable; built-in
 * agents use the formal host-service `agents.run` route before their
 * pane mounts.
 *
 * Non-terminal kinds reuse v1's per-kind state shapes verbatim
 * (`CommentPaneState`/`DevToolsPaneState`/`BrowserPaneState`) so the
 * existing v1 pane components can read them from `useTabsStore`
 * unchanged once mounted under the panes engine.
 */
export interface V1PanesPaneData extends HostServiceTerminalPaneSnapshot {
	terminalId: string;
	status?: PaneStatus;
	cwdConfirmed?: boolean;
	/** Shell command run once on session create (preset launch). */
	initialCommand?: string;
	/** Working directory for the session (preset cwd). */
	initialCwd?: string;

	// --- comment pane (kind: "comment") ---
	comment?: CommentPaneState;

	// --- devtools pane (kind: "devtools") ---
	devtools?: DevToolsPaneState;

	// --- webview pane (kind: "webview") ---
	browser?: BrowserPaneState;
}
