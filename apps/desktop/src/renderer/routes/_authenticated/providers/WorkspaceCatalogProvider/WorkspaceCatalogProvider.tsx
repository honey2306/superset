import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type {
	ProjectSnapshotShape,
	WorkspaceSnapshotShape,
} from "@superset/host-service/workspace-catalog";
import { emptyProjection, type ProjectionState } from "./catalogProjection";

export type ProjectProjection = ProjectSnapshotShape;
export type WorkspaceProjection = WorkspaceSnapshotShape;

export interface UseWorkspaceCatalogValue {
	projects: ProjectProjection[];
	workspaces: WorkspaceProjection[];
	isReady: boolean;
	resolveHostUrl(hostId: string): string | null;
}

interface Ctx {
	state: ProjectionState;
	isReady: boolean;
	resolveHostUrl: (hostId: string) => string | null;
}

const CatalogContext = createContext<Ctx | null>(null);

export interface WorkspaceCatalogProviderProps {
	children: ReactNode;
	/**
	 * Injection point for M3b's snapshot/subscribe loop. Left optional so
	 * the provider can render before the host client is available (e.g.
	 * during authentication bootstrap) — in that state the projection is
	 * empty but stable. Wiring to `snapshot/changes/catalog:changed` will
	 * land alongside the caller migration in M4.
	 */
	initialState?: ProjectionState;
	resolveHostUrl?: (hostId: string) => string | null;
	isReady?: boolean;
}

export function WorkspaceCatalogProvider({
	children,
	initialState,
	resolveHostUrl,
	isReady,
}: WorkspaceCatalogProviderProps) {
	const [state] = useState<ProjectionState>(initialState ?? emptyProjection());
	const value = useMemo<Ctx>(
		() => ({
			state,
			isReady: isReady ?? false,
			resolveHostUrl: resolveHostUrl ?? (() => null),
		}),
		[state, isReady, resolveHostUrl],
	);
	return (
		<CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
	);
}

export function useWorkspaceCatalog(): UseWorkspaceCatalogValue {
	const ctx = useContext(CatalogContext);
	if (!ctx) {
		throw new Error(
			"useWorkspaceCatalog must be used inside a <WorkspaceCatalogProvider>",
		);
	}
	return useMemo(
		() => ({
			projects: Array.from(ctx.state.projects.values()),
			workspaces: Array.from(ctx.state.workspaces.values()),
			isReady: ctx.isReady,
			resolveHostUrl: ctx.resolveHostUrl,
		}),
		[ctx.state, ctx.isReady, ctx.resolveHostUrl],
	);
}

export function useWorkspaceProjection(
	workspaceId: string,
): WorkspaceProjection | null {
	const ctx = useContext(CatalogContext);
	if (!ctx) return null;
	return ctx.state.workspaces.get(workspaceId) ?? null;
}
