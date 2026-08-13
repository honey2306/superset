import type { Pane } from "@superset/panes";
import { useCallback } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import {
	extractPaneIds,
	type PaneLifecycleRow,
} from "renderer/routes/_local/components/utils/paneLifecycleRows";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import type { LocalProductStateCollections } from "renderer/routes/_local/providers/LocalProductStateProvider/collections";
import {
	getNextTabOrder,
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_local/providers/LocalProductStateProvider/dashboardSidebarLocal";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";
import {
	createEmptyPaneLayout,
	removeProjectFromSidebarState,
	tombstoneSidebarWorkspaceRecord,
} from "./sidebarMutations";

type ProjectTopLevelItem = {
	type: "workspace" | "section";
	id: string;
	tabOrder: number;
};

type ProjectTopLevelCollections = Pick<
	LocalProductStateCollections,
	"sidebarSections" | "workspaceLocalState"
>;

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
	if (
		fromIndex < 0 ||
		fromIndex >= items.length ||
		toIndex < 0 ||
		toIndex >= items.length ||
		fromIndex === toIndex
	) {
		return items;
	}
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1);
	if (moved === undefined) return items;
	next.splice(toIndex, 0, moved);
	return next;
}

function compareProjectTopLevelItems(
	left: ProjectTopLevelItem,
	right: ProjectTopLevelItem,
): number {
	const orderDelta = left.tabOrder - right.tabOrder;
	if (orderDelta !== 0) return orderDelta;
	if (left.type === right.type) return 0;
	return left.type === "section" ? -1 : 1;
}

function getProjectTopLevelItems(
	collections: ProjectTopLevelCollections,
	projectId: string,
	options: { excludeWorkspaceId?: string; excludeSectionId?: string } = {},
): ProjectTopLevelItem[] {
	return [
		...Array.from(collections.workspaceLocalState.state.values())
			.filter(
				(item) =>
					item.sidebarState.projectId === projectId &&
					isSidebarWorkspaceVisible(item) &&
					item.sidebarState.sectionId === null &&
					item.workspaceId !== options.excludeWorkspaceId,
			)
			.map((item) => ({
				type: "workspace" as const,
				id: item.workspaceId,
				tabOrder: item.sidebarState.tabOrder,
			})),
		...Array.from(collections.sidebarSections.state.values())
			.filter(
				(item) =>
					item.projectId === projectId &&
					item.sectionId !== options.excludeSectionId,
			)
			.map((item) => ({
				type: "section" as const,
				id: item.sectionId,
				tabOrder: item.tabOrder,
			})),
	].sort(compareProjectTopLevelItems);
}

function getFirstSectionIndex(items: ProjectTopLevelItem[]): number {
	const firstSectionIndex = items.findIndex((item) => item.type === "section");
	return firstSectionIndex === -1 ? items.length : firstSectionIndex;
}

/**
 * Rewrites the flat top-level project lane. Workspace items are explicitly
 * ungrouped by setting sidebarState.projectId and clearing sidebarState.sectionId.
 */
function writeProjectTopLevelOrder(
	collections: ProjectTopLevelCollections,
	projectId: string,
	items: ProjectTopLevelItem[],
): void {
	items.forEach((item, index) => {
		const tabOrder = index + 1;
		if (item.type === "workspace") {
			if (!collections.workspaceLocalState.get(item.id)) return;
			collections.workspaceLocalState.update(item.id, (draft) => {
				draft.sidebarState.projectId = projectId;
				draft.sidebarState.sectionId = null;
				draft.sidebarState.tabOrder = tabOrder;
				draft.sidebarState.isHidden = false;
			});
			return;
		}

		if (!collections.sidebarSections.get(item.id)) return;
		collections.sidebarSections.update(item.id, (draft) => {
			draft.tabOrder = tabOrder;
		});
	});
}

function ensureSidebarProjectRecord(
	collections: Pick<LocalProductStateCollections, "sidebarProjects">,
	projectId: string,
): void {
	if (collections.sidebarProjects.get(projectId)) {
		return;
	}

	collections.sidebarProjects.insert({
		projectId,
		createdAt: new Date(),
		tabOrder: getNextTabOrder([...collections.sidebarProjects.state.values()]),
		isCollapsed: false,
	});
}

function ensureSidebarWorkspaceRecord(
	collections: Pick<
		LocalProductStateCollections,
		"sidebarSections" | "workspaceLocalState"
	>,
	workspaceId: string,
	projectId: string,
): void {
	const existing = collections.workspaceLocalState.get(workspaceId);
	if (existing && isSidebarWorkspaceVisible(existing)) {
		return;
	}

	const topLevelItems = getProjectTopLevelItems(collections, projectId);

	if (existing) {
		collections.workspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.projectId = projectId;
			draft.sidebarState.tabOrder = getPrependTabOrder(topLevelItems);
			draft.sidebarState.sectionId = null;
			draft.sidebarState.isHidden = false;
		});
		return;
	}

	collections.workspaceLocalState.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: getPrependTabOrder(topLevelItems),
			sectionId: null,
			isHidden: false,
		},
		paneLayout: createEmptyPaneLayout(),
	});
}

function getTerminalRuntimeId(pane: Pane<unknown>): string | null {
	if (pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const data = pane.data as { terminalId?: unknown };
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

function getBrowserRuntimeId(pane: Pane<unknown>): string | null {
	return pane.kind === "browser" ? pane.id : null;
}

function cleanupWorkspacePaneRuntimes(rows: PaneLifecycleRow[]): void {
	for (const terminalId of extractPaneIds(rows, getTerminalRuntimeId)) {
		terminalRuntimeRegistry.release(terminalId);
	}
	for (const _browserId of extractPaneIds(rows, getBrowserRuntimeId)) {
		// destroyPersistentWebview removed with internal browser feature
	}
}

export function useDashboardSidebarState() {
	const collections = useLocalCollections();
	const { workspaces: hostWorkspaces } = useWorkspaceCatalog();

	const ensureProjectInSidebar = useCallback(
		(projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
		},
		[collections],
	);

	const ensureWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string) => {
			ensureSidebarProjectRecord(collections, projectId);
			ensureSidebarWorkspaceRecord(collections, workspaceId, projectId);
		},
		[collections],
	);

	const toggleProjectCollapsed = useCallback(
		(projectId: string) => {
			const existing = collections.sidebarProjects.get(projectId);
			if (!existing) return;
			collections.sidebarProjects.update(projectId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections],
	);

	const reorderProjects = useCallback(
		(projectIds: string[]) => {
			projectIds.forEach((projectId, index) => {
				if (!collections.sidebarProjects.get(projectId)) return;
				collections.sidebarProjects.update(projectId, (draft) => {
					draft.tabOrder = index + 1;
				});
			});
		},
		[collections],
	);

	const reorderProjectsByIndex = useCallback(
		(fromIndex: number, toIndex: number) => {
			const rows = Array.from(collections.sidebarProjects.state.values()).sort(
				(left, right) => left.tabOrder - right.tabOrder,
			);
			for (const [index, row] of moveItem(rows, fromIndex, toIndex).entries()) {
				collections.sidebarProjects.update(row.projectId, (draft) => {
					draft.tabOrder = index + 1;
				});
			}
		},
		[collections],
	);

	const reorderWorkspaces = useCallback(
		(workspaceIds: string[]) => {
			workspaceIds.forEach((workspaceId, index) => {
				if (!collections.workspaceLocalState.get(workspaceId)) return;
				collections.workspaceLocalState.update(workspaceId, (draft) => {
					draft.sidebarState.tabOrder = index + 1;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections],
	);

	const reorderProjectChildrenByIndex = useCallback(
		(projectId: string, fromIndex: number, toIndex: number) => {
			const items = getProjectTopLevelItems(collections, projectId);
			writeProjectTopLevelOrder(
				collections,
				projectId,
				moveItem(items, fromIndex, toIndex),
			);
		},
		[collections],
	);

	const reorderWorkspacesInSectionByIndex = useCallback(
		(sectionId: string, fromIndex: number, toIndex: number) => {
			const rows = Array.from(collections.workspaceLocalState.state.values())
				.filter(
					(item) =>
						item.sidebarState.sectionId === sectionId &&
						isSidebarWorkspaceVisible(item),
				)
				.sort(
					(left, right) =>
						left.sidebarState.tabOrder - right.sidebarState.tabOrder,
				);
			for (const [index, row] of moveItem(rows, fromIndex, toIndex).entries()) {
				collections.workspaceLocalState.update(row.workspaceId, (draft) => {
					draft.sidebarState.tabOrder = index + 1;
				});
			}
		},
		[collections],
	);

	const reorderProjectChildren = useCallback(
		(
			projectId: string,
			orderedItems: Array<{ type: "workspace" | "section"; id: string }>,
		) => {
			orderedItems.forEach((item, index) => {
				const tabOrder = index + 1;
				if (item.type === "workspace") {
					if (!collections.workspaceLocalState.get(item.id)) return;
					collections.workspaceLocalState.update(item.id, (draft) => {
						draft.sidebarState.tabOrder = tabOrder;
						draft.sidebarState.sectionId = null;
						draft.sidebarState.projectId = projectId;
						draft.sidebarState.isHidden = false;
					});
				} else {
					if (!collections.sidebarSections.get(item.id)) return;
					collections.sidebarSections.update(item.id, (draft) => {
						draft.tabOrder = tabOrder;
					});
				}
			});
		},
		[collections],
	);

	const moveWorkspaceToSectionAtIndex = useCallback(
		(
			workspaceId: string,
			projectId: string,
			sectionId: string,
			index: number,
		) => {
			const existing = collections.workspaceLocalState.get(workspaceId);
			if (!existing) return;
			const siblings = Array.from(
				collections.workspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.workspaceId !== workspaceId &&
						item.sidebarState.sectionId === sectionId,
				)
				.sort((a, b) => a.sidebarState.tabOrder - b.sidebarState.tabOrder);
			const reordered = [...siblings];
			reordered.splice(index, 0, existing);
			reordered.forEach((item, i) => {
				collections.workspaceLocalState.update(item.workspaceId, (draft) => {
					draft.sidebarState.tabOrder = i + 1;
					draft.sidebarState.sectionId = sectionId;
					draft.sidebarState.projectId = projectId;
					draft.sidebarState.isHidden = false;
				});
			});
		},
		[collections],
	);

	const createSection = useCallback(
		(projectId: string, options: { name?: string } = {}) => {
			const { name = "New group" } = options;
			ensureSidebarProjectRecord(collections, projectId);

			const sectionId = crypto.randomUUID();
			const randomColor =
				PROJECT_CUSTOM_COLORS[
					Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
				].value;

			const tabOrder = getNextTabOrder(
				getProjectTopLevelItems(collections, projectId),
			);

			collections.sidebarSections.insert({
				sectionId,
				projectId,
				name,
				createdAt: new Date(),
				tabOrder,
				isCollapsed: false,
				color: randomColor,
			});

			return sectionId;
		},
		[collections],
	);

	const toggleSectionCollapsed = useCallback(
		(sectionId: string) => {
			if (!collections.sidebarSections.get(sectionId)) return;
			collections.sidebarSections.update(sectionId, (draft) => {
				draft.isCollapsed = !draft.isCollapsed;
			});
		},
		[collections],
	);

	const renameSection = useCallback(
		(sectionId: string, name: string) => {
			if (!collections.sidebarSections.get(sectionId)) return;
			collections.sidebarSections.update(sectionId, (draft) => {
				draft.name = name.trim();
			});
		},
		[collections],
	);

	const setSectionColor = useCallback(
		(sectionId: string, color: string | null) => {
			if (!collections.sidebarSections.get(sectionId)) return;
			collections.sidebarSections.update(sectionId, (draft) => {
				draft.color = color;
			});
		},
		[collections],
	);

	const setWorkspaceUnread = useCallback(
		(workspaceId: string, projectId: string, isUnread: boolean) => {
			const existing = collections.workspaceLocalState.get(workspaceId);
			if (existing) {
				collections.workspaceLocalState.update(workspaceId, (draft) => {
					draft.sidebarState.isUnread = isUnread;
				});
				return;
			}
			collections.workspaceLocalState.insert({
				workspaceId,
				createdAt: new Date(),
				sidebarState: {
					projectId,
					tabOrder: 0,
					sectionId: null,
					isHidden: false,
					isUnread,
				},
				paneLayout: createEmptyPaneLayout(),
			});
		},
		[collections],
	);

	const moveWorkspaceToSection = useCallback(
		(workspaceId: string, projectId: string, sectionId: string | null) => {
			const existing = collections.workspaceLocalState.get(workspaceId);
			if (!existing) return;

			if (sectionId === null) {
				const topLevelItems = getProjectTopLevelItems(collections, projectId, {
					excludeWorkspaceId: workspaceId,
				});
				const insertIndex = getFirstSectionIndex(topLevelItems);
				topLevelItems.splice(insertIndex, 0, {
					type: "workspace",
					id: workspaceId,
					tabOrder: 0,
				});
				writeProjectTopLevelOrder(collections, projectId, topLevelItems);
				return;
			}

			const siblingRows = Array.from(
				collections.workspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.workspaceId !== workspaceId &&
						item.sidebarState.sectionId === sectionId,
				)
				.map((item) => ({ tabOrder: item.sidebarState.tabOrder }));

			collections.workspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.projectId = projectId;
				draft.sidebarState.sectionId = sectionId;
				draft.sidebarState.tabOrder = getNextTabOrder(siblingRows);
				draft.sidebarState.isHidden = false;
			});
		},
		[collections],
	);

	const moveWorkspacesToSection = useCallback(
		(
			workspaceIds: string[],
			projectId: string,
			sectionId: string | null,
			rootPlacement: "top" | "bottom" = "top",
		) => {
			if (sectionId !== null) {
				for (const workspaceId of workspaceIds) {
					moveWorkspaceToSection(workspaceId, projectId, sectionId);
				}
				return;
			}

			const selected = new Set(workspaceIds);
			const topLevelItems = getProjectTopLevelItems(
				collections,
				projectId,
			).filter((item) => !(item.type === "workspace" && selected.has(item.id)));
			const workspaceItems = workspaceIds
				.map((id) => ({ type: "workspace" as const, id, tabOrder: 0 }))
				.filter((item) => collections.workspaceLocalState.get(item.id));
			const insertIndex =
				rootPlacement === "bottom"
					? topLevelItems.length
					: getFirstSectionIndex(topLevelItems);
			topLevelItems.splice(insertIndex, 0, ...workspaceItems);
			writeProjectTopLevelOrder(collections, projectId, topLevelItems);
		},
		[collections, moveWorkspaceToSection],
	);

	const createSectionFromWorkspaces = useCallback(
		(projectId: string, workspaceIds: string[], name = "New Section") => {
			const sectionId = createSection(projectId, { name });
			moveWorkspacesToSection(workspaceIds, projectId, sectionId);
			return sectionId;
		},
		[createSection, moveWorkspacesToSection],
	);

	const deleteSection = useCallback(
		(sectionId: string) => {
			const section = collections.sidebarSections.get(sectionId);
			if (!section) return;

			const topLevelItems = getProjectTopLevelItems(
				collections,
				section.projectId,
				{ excludeSectionId: sectionId },
			);
			const sectionWorkspaces = Array.from(
				collections.workspaceLocalState.state.values(),
			)
				.filter(
					(item) =>
						item.sidebarState.projectId === section.projectId &&
						isSidebarWorkspaceVisible(item) &&
						item.sidebarState.sectionId === sectionId,
				)
				.sort(
					(left, right) =>
						left.sidebarState.tabOrder - right.sidebarState.tabOrder,
				);

			const insertIndex = getFirstSectionIndex(topLevelItems);
			topLevelItems.splice(
				insertIndex,
				0,
				...sectionWorkspaces.map((workspace) => ({
					type: "workspace" as const,
					id: workspace.workspaceId,
					tabOrder: 0,
				})),
			);
			writeProjectTopLevelOrder(collections, section.projectId, topLevelItems);

			collections.sidebarSections.delete(sectionId);
		},
		[collections],
	);

	const removeWorkspaceFromSidebar = useCallback(
		(workspaceId: string) => {
			const workspace = collections.workspaceLocalState.get(workspaceId);
			if (!workspace) return;
			cleanupWorkspacePaneRuntimes([workspace]);
			collections.workspaceLocalState.delete(workspaceId);
		},
		[collections],
	);

	const hideWorkspaceInSidebar = useCallback(
		(workspaceId: string, projectId: string) => {
			tombstoneSidebarWorkspaceRecord(
				collections,
				workspaceId,
				projectId,
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections],
	);

	const removeProjectFromSidebar = useCallback(
		(projectId: string) => {
			removeProjectFromSidebarState(
				collections,
				hostWorkspaces,
				projectId,
				cleanupWorkspacePaneRuntimes,
			);
		},
		[collections, hostWorkspaces],
	);

	return {
		createSection,
		createSectionFromWorkspaces,
		deleteSection,
		ensureProjectInSidebar,
		ensureWorkspaceInSidebar,
		hideWorkspaceInSidebar,
		moveWorkspaceToSection,
		moveWorkspaceToSectionAtIndex,
		moveWorkspacesToSection,
		removeProjectFromSidebar,
		reorderProjectChildren,
		reorderProjectChildrenByIndex,
		removeWorkspaceFromSidebar,
		reorderProjects,
		reorderProjectsByIndex,
		reorderWorkspaces,
		reorderWorkspacesInSectionByIndex,
		renameSection,
		setSectionColor,
		setWorkspaceUnread,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	};
}
