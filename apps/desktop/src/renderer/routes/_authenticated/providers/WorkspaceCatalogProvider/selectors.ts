/**
 * Convenience selectors on top of `useWorkspaceCatalog`. These are what
 * Appendix A callers migrate to when replacing `electronTrpc.workspaces.*`
 * or Electric `useLiveQuery` over `v2Workspaces` — the underlying
 * projection is cache-first (see WorkspaceCatalogProvider), so existing
 * data renders before `isReady` flips.
 */
import { useMemo } from "react";
import {
	type ProjectProjection,
	useWorkspaceCatalog,
	type WorkspaceProjection,
} from "./WorkspaceCatalogProvider";

export interface UseCatalogWorkspacesResult {
	workspaces: WorkspaceProjection[];
	isReady: boolean;
}

/** All workspaces across every project this host serves. Order stable
 *  by (createdAt, id) inside the projection map iteration. */
export function useCatalogWorkspaces(): UseCatalogWorkspacesResult {
	const { workspaces, isReady } = useWorkspaceCatalog();
	return useMemo(() => ({ workspaces, isReady }), [workspaces, isReady]);
}

/** Every workspace belonging to a specific project. */
export function useCatalogWorkspacesByProject(
	projectId: string | null | undefined,
): UseCatalogWorkspacesResult {
	const { workspaces, isReady } = useWorkspaceCatalog();
	const filtered = useMemo(() => {
		if (!projectId) return [];
		return workspaces.filter((ws) => ws.projectId === projectId);
	}, [workspaces, projectId]);
	return { workspaces: filtered, isReady };
}

export interface UseCatalogWorkspaceResult {
	workspace: WorkspaceProjection | null;
	isReady: boolean;
}

/** A single workspace by id — most Appendix A entries need only this. */
export function useCatalogWorkspace(
	workspaceId: string | null | undefined,
): UseCatalogWorkspaceResult {
	const { workspaces, isReady } = useWorkspaceCatalog();
	const workspace = useMemo(() => {
		if (!workspaceId) return null;
		return workspaces.find((ws) => ws.id === workspaceId) ?? null;
	}, [workspaces, workspaceId]);
	return { workspace, isReady };
}

export interface UseCatalogProjectsResult {
	projects: ProjectProjection[];
	isReady: boolean;
}

export function useCatalogProjects(): UseCatalogProjectsResult {
	const { projects, isReady } = useWorkspaceCatalog();
	return useMemo(() => ({ projects, isReady }), [projects, isReady]);
}

export interface UseCatalogProjectResult {
	project: ProjectProjection | null;
	isReady: boolean;
}

export function useCatalogProject(
	projectId: string | null | undefined,
): UseCatalogProjectResult {
	const { projects, isReady } = useWorkspaceCatalog();
	const project = useMemo(() => {
		if (!projectId) return null;
		return projects.find((p) => p.id === projectId) ?? null;
	}, [projects, projectId]);
	return { project, isReady };
}

/**
 * Previous / next workspace within the same project by (createdAt, id)
 * ordering. Used by the Cmd+Shift+[ / Cmd+Shift+] hotkeys.
 *
 * Returns null when no anchor is provided or the anchor is out of
 * projection (e.g. still-in-flight Provisioning operation before Catalog
 * commit). Callers should treat "no neighbour" and "no anchor" the same
 * way — do nothing.
 */
export interface UseCatalogWorkspaceNeighboursResult {
	previous: WorkspaceProjection | null;
	next: WorkspaceProjection | null;
}

export function useCatalogWorkspaceNeighbours(
	workspaceId: string | null | undefined,
): UseCatalogWorkspaceNeighboursResult {
	const { workspaces } = useWorkspaceCatalog();
	return useMemo(() => {
		if (!workspaceId) return { previous: null, next: null };
		const idx = workspaces.findIndex((w) => w.id === workspaceId);
		if (idx === -1) return { previous: null, next: null };
		const anchor = workspaces[idx];
		if (!anchor) return { previous: null, next: null };
		const sameProject = workspaces.filter(
			(w) => w.projectId === anchor.projectId,
		);
		const positionInProject = sameProject.findIndex(
			(w) => w.id === workspaceId,
		);
		const previous =
			positionInProject > 0 ? sameProject[positionInProject - 1] : null;
		const next =
			positionInProject >= 0 && positionInProject < sameProject.length - 1
				? sameProject[positionInProject + 1]
				: null;
		return { previous: previous ?? null, next: next ?? null };
	}, [workspaces, workspaceId]);
}
