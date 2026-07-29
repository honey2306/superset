/**
 * Recently-viewed file record + display limits shared between the v1
 * command palette and the panes engine's file-history hook.
 *
 * Lifted out of the v2-workspace route so the v1 command palette can depend
 * on them without reaching into a route tree slated for removal. The hook
 * itself (`useRecentlyViewedFiles`) stays with the panes engine because it
 * owns the live-query wiring against the workspace-local-state collection.
 */

export interface RecentFile {
	relativePath: string;
	absolutePath: string;
	lastAccessedAt: number;
}

/** Max entries persisted per workspace in the local-state collection. */
export const RECENT_STORE_LIMIT = 25;

/** Max entries surfaced at once in the command palette's "Recent" section. */
export const RECENT_DISPLAY_LIMIT = 10;
