import { useMemo } from "react";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";

export type WorkspaceHostTarget =
	| { status: "loading" }
	| { status: "not-found" }
	| { status: "local-starting"; hostId: string }
	| { status: "ready"; kind: "local"; hostId: string; url: string };

/**
 * Resolves a workspace ID to its owning host-service target.
 *
 * The status union lets callers distinguish "still loading the collection"
 * from "local host hasn't booted yet" from "workspace doesn't exist on this
 * client" — three states the previous `string | null` API collapsed into one.
 */
export function useWorkspaceHostTarget(
	workspaceId: string | null,
): WorkspaceHostTarget {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { workspaces, isReady } = useWorkspaceCatalog();
	const match = workspaceId
		? (workspaces.find((w) => w.id === workspaceId) ?? null)
		: null;

	return useMemo(() => {
		if (!workspaceId || (!isReady && !match)) return { status: "loading" };
		if (!match) return { status: "not-found" };
		if (activeHostUrl) {
			return {
				status: "ready",
				kind: "local",
				hostId: machineId,
				url: activeHostUrl,
			};
		}
		return { status: "local-starting", hostId: machineId };
	}, [workspaceId, isReady, match, machineId, activeHostUrl]);
}

/**
 * Backwards-compatible URL-only form for existing callers. Returns null
 * for any non-`ready` status (loading, local-starting, not-found).
 */
export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const target = useWorkspaceHostTarget(workspaceId);
	return target.status === "ready" ? target.url : null;
}
