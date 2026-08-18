import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import {
	configurePanesPersistence,
	hydratePanesRepository,
	type PanesPaneData,
} from "renderer/lib/panes";
import { LOCAL_HOST_SCOPE_ID } from "shared/constants";
import {
	getLocalProductStateCollections,
	type LocalProductStateCollections,
	preloadLocalProductState,
} from "./collections";

const LocalProductStateContext =
	createContext<LocalProductStateCollections | null>(null);

function PaneRepositoryHydrator({
	collections,
}: {
	collections: LocalProductStateCollections;
}) {
	const { data: rows = [], isReady } = useLiveQuery(
		(query) => query.from({ rows: collections.workspaceLocalState }),
		[collections],
	);

	useEffect(() => {
		// TanStack DB is cache-first: persisted rows can be available before the
		// collection reaches strict readiness. Hydrate those rows immediately so
		// switching workspaces does not flash a loading screen.
		if (!isReady && rows.length === 0) return;
		hydratePanesRepository(
			rows.map((row) => ({
				workspaceId: row.workspaceId,
				paneLayout: row.paneLayout as WorkspaceState<PanesPaneData>,
			})),
		);
	}, [isReady, rows]);

	return null;
}

export function LocalProductStateProvider({
	children,
}: {
	children: ReactNode;
}) {
	const collections = useMemo(
		() => getLocalProductStateCollections(LOCAL_HOST_SCOPE_ID),
		[],
	);
	useEffect(() => {
		void preloadLocalProductState(LOCAL_HOST_SCOPE_ID).catch((error) => {
			console.error(
				"[local-product-state] Failed to preload local state:",
				error,
			);
		});
	}, []);

	useEffect(() => {
		configurePanesPersistence((workspaceId, update) => {
			const row = collections.workspaceLocalState.get(workspaceId);
			if (!row) return false;
			collections.workspaceLocalState.update(workspaceId, (draft) => {
				draft.paneLayout = update(
					draft.paneLayout as WorkspaceState<PanesPaneData>,
				);
			});
			return true;
		});
		return () => configurePanesPersistence(null);
	}, [collections]);

	return (
		<LocalProductStateContext.Provider value={collections}>
			<PaneRepositoryHydrator collections={collections} />
			{children}
		</LocalProductStateContext.Provider>
	);
}

export function useLocalCollections(): LocalProductStateCollections {
	const context = useContext(LocalProductStateContext);
	if (!context) {
		throw new Error(
			"useLocalCollections must be used within LocalProductStateProvider",
		);
	}
	return context;
}
