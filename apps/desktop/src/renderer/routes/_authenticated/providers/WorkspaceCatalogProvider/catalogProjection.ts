/**
 * Pure catalog projection reducer for M3b.
 *
 * The provider owns a snapshot per host, and replays every
 * `workspaceCatalog.changes` page (plus every live `catalog:changed`
 * event's replayed page) through this reducer. Keeping the reducer pure
 * lets the provider be tested without a running host.
 *
 * Not stored: which route or pane is active, sidebar section membership,
 * unread markers. Those live in `v2WorkspaceLocalState` and the
 * dashboard-sidebar collections — the projection is identity + display
 * only, matching the wire schema in the host's catalog Module.
 */

import type {
	WorkspaceCatalogChange,
	WorkspaceCatalogSnapshot,
} from "@superset/host-service/workspace-catalog";

export interface ProjectionState {
	revision: number;
	projects: Map<string, WorkspaceCatalogSnapshot["projects"][number]>;
	workspaces: Map<string, WorkspaceCatalogSnapshot["workspaces"][number]>;
	unresolvedIdentityConflicts: number;
}

export const emptyProjection = (): ProjectionState => ({
	revision: 0,
	projects: new Map(),
	workspaces: new Map(),
	unresolvedIdentityConflicts: 0,
});

export function installSnapshot(
	snapshot: WorkspaceCatalogSnapshot,
): ProjectionState {
	const projects = new Map(snapshot.projects.map((p) => [p.id, p]));
	const workspaces = new Map(snapshot.workspaces.map((w) => [w.id, w]));
	return {
		revision: snapshot.revision,
		projects,
		workspaces,
		unresolvedIdentityConflicts: snapshot.health.unresolvedIdentityConflicts,
	};
}

/**
 * Apply changes strictly in revision order. Applies out-of-order entries
 * are ignored (they'll re-arrive on the next page). The caller is
 * expected to feed pages in ascending order.
 */
export function applyChanges(
	base: ProjectionState,
	changes: WorkspaceCatalogChange[],
): ProjectionState {
	let next = base;
	for (const change of changes) {
		if (change.revision <= next.revision) continue;
		next = applyOne(next, change);
	}
	return next;
}

function applyOne(
	state: ProjectionState,
	change: WorkspaceCatalogChange,
): ProjectionState {
	const revision = change.revision;
	if (change.entityType === "project") {
		const projects = new Map(state.projects);
		if (change.eventType === "deleted") {
			projects.delete(change.entityId);
		} else if (change.snapshot) {
			projects.set(
				change.entityId,
				change.snapshot as WorkspaceCatalogSnapshot["projects"][number],
			);
		}
		return { ...state, revision, projects };
	}
	const workspaces = new Map(state.workspaces);
	if (change.eventType === "deleted") {
		workspaces.delete(change.entityId);
	} else if (change.snapshot) {
		workspaces.set(
			change.entityId,
			change.snapshot as WorkspaceCatalogSnapshot["workspaces"][number],
		);
	}
	return { ...state, revision, workspaces };
}

/**
 * Track the highest revision seen on the live event stream while a
 * snapshot request is still in flight. Once the snapshot installs, the
 * caller pumps `changes(afterRevision: snapshot.revision)` until the
 * cursor reaches or exceeds this high-water mark; only then does the
 * live listener stop being a queue.
 */
export function makeHighWaterMark(): {
	current: () => number;
	observe: (revision: number) => void;
} {
	let value = 0;
	return {
		current: () => value,
		observe: (revision) => {
			if (revision > value) value = revision;
		},
	};
}
