import type {
	ProjectSnapshotShape,
	WorkspaceSnapshotShape,
} from "@superset/host-service/workspace-catalog";
import { getEventBus } from "@superset/workspace-client";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useMaybeLocalHostService } from "../LocalHostServiceProvider";
import {
	applyChanges,
	emptyProjection,
	installSnapshot,
	makeHighWaterMark,
	type ProjectionState,
} from "./catalogProjection";

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
	 * Test injection: pre-populate the projection. Production always
	 * pulls from the host via snapshot+changes.
	 */
	initialState?: ProjectionState;
}

/**
 * Local-host Workspace Catalog subscriber. On mount:
 *   1. Subscribes to `catalog:changed` events before the snapshot fetch
 *      finishes — tracks the highest observed revision on a high-water
 *      mark so no live update is dropped while snapshot is in flight.
 *   2. Fetches `workspaceCatalog.snapshot` and installs it atomically.
 *   3. Pulls `workspaceCatalog.changes(afterRevision)` until the cursor
 *      reaches or exceeds the recorded high-water mark, then applies
 *      subsequent live events straight to the projection.
 *
 * Cache-first rendering: after the initial snapshot lands the projection
 * stays populated across reconnect blips; `isReady` only re-flips false
 * if the caller clears state (currently: never).
 *
 * Remote-host fan-out lives in a later PR — this provider today mirrors
 * the local host so the renderer can start consuming the projection
 * incrementally without a second data source.
 */
export function WorkspaceCatalogProvider({
	children,
	initialState,
}: WorkspaceCatalogProviderProps) {
	const activeHostUrl = useMaybeLocalHostService()?.activeHostUrl ?? null;
	const [state, setState] = useState<ProjectionState>(
		initialState ?? emptyProjection(),
	);
	const [isReady, setIsReady] = useState<boolean>(false);
	const highWaterMarkRef = useRef(makeHighWaterMark());

	// Subscribe to catalog:changed BEFORE fetching the snapshot so any
	// event landing between snapshot request and install is captured on
	// the high-water mark. When the event fires, replay `changes` from
	// our current revision forward; there is no per-event payload, only a
	// wake-up ping.
	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getEventBus(activeHostUrl, () =>
			getHostServiceWsToken(activeHostUrl),
		);
		const off = bus.on("catalog:changed", "*", (_scope, payload) => {
			highWaterMarkRef.current.observe(payload.revision);
			void pullChanges();
		});
		const retain = bus.retain();

		const pullChanges = async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			let cursor = state.revision;
			while (true) {
				const page = await client.workspaceCatalog.changes.query({
					afterRevision: cursor,
				});
				if (page.changes.length === 0) break;
				setState((prev) => applyChanges(prev, page.changes));
				cursor = page.nextRevision;
				if (!page.hasMore) break;
			}
		};

		return () => {
			off();
			retain();
		};
	}, [activeHostUrl, state.revision]);

	// Snapshot + catch-up loop.
	useEffect(() => {
		if (!activeHostUrl) return;
		let cancelled = false;
		void (async () => {
			try {
				const client = getHostServiceClientByUrl(activeHostUrl);
				const snapshot = await client.workspaceCatalog.snapshot.query();
				if (cancelled) return;
				setState(installSnapshot(snapshot));
				setIsReady(true);
				// Catch up any events that landed between the snapshot's
				// revision and the current high-water mark.
				let cursor = snapshot.revision;
				while (cursor < highWaterMarkRef.current.current()) {
					const page = await client.workspaceCatalog.changes.query({
						afterRevision: cursor,
					});
					if (cancelled) return;
					if (page.changes.length === 0) break;
					setState((prev) => applyChanges(prev, page.changes));
					cursor = page.nextRevision;
					if (!page.hasMore) break;
				}
			} catch (err) {
				// Absent host, network hiccup, or pre-M1 host-service — leave
				// the projection empty rather than throwing; the 30s refetch
				// path below plus reconnect handling heal transient failures.
				console.warn(
					"[workspace-catalog] snapshot fetch failed; will retry on next mount/refresh",
					err,
				);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeHostUrl]);

	// Periodic healing path — refetch snapshot every 30s so a dropped
	// event stream eventually converges even if reconnection missed the
	// wake-up.
	useEffect(() => {
		if (!activeHostUrl) return;
		const id = setInterval(() => {
			void (async () => {
				try {
					const client = getHostServiceClientByUrl(activeHostUrl);
					const snapshot = await client.workspaceCatalog.snapshot.query();
					setState((prev) =>
						snapshot.revision >= prev.revision
							? installSnapshot(snapshot)
							: prev,
					);
				} catch {
					// heal on next tick
				}
			})();
		}, 30_000);
		return () => clearInterval(id);
	}, [activeHostUrl]);

	const resolveHostUrl = useCallback(
		(_hostId: string) => activeHostUrl,
		[activeHostUrl],
	);

	const value = useMemo<Ctx>(
		() => ({ state, isReady, resolveHostUrl }),
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
