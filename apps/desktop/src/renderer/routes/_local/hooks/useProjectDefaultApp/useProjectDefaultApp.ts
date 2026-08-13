import type { ExternalApp } from "@superset/shared/desktop-types";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";

/**
 * Single source of truth for the per-project "open in" app choice selected
 * through the CMD+O menu. Consumers go through this hook so CMD+O and
 * file-open flows stay in sync with `sidebarProjects.defaultOpenInApp`.
 */
export function useProjectDefaultApp(projectId: string | undefined) {
	const collections = useLocalCollections();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.sidebarProjects })
				.where(({ sp }) => eq(sp.projectId, projectId ?? ""))
				.select(({ sp }) => ({ defaultOpenInApp: sp.defaultOpenInApp })),
		[collections, projectId],
	);
	const app =
		(rows[0]?.defaultOpenInApp as ExternalApp | null | undefined) ?? undefined;

	const setApp = useCallback(
		(next: ExternalApp) => {
			if (!projectId) return;
			ensureProjectInSidebar(projectId);
			collections.sidebarProjects.update(projectId, (draft) => {
				draft.defaultOpenInApp = next;
			});
		},
		[collections, ensureProjectInSidebar, projectId],
	);

	return { app, setApp };
}
