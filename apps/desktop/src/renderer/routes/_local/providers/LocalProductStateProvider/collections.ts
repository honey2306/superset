import { BasicIndex } from "@tanstack/db";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { reclaimTerminalStateForQuota } from "renderer/lib/terminal/terminal-buffer-gc";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	healUserPreferences,
	healWorkspaceLocalState,
	type TerminalPresetRow,
	terminalPresetSchema,
	type UserPreferencesRow,
	userPreferencesSchema,
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";
import { notifyQuotaExhausted } from "./notifyQuotaExhausted";
import { withQuotaGuard } from "./withQuotaGuard";
import { withReadHeal } from "./withReadHeal";

const indexDefaults = {
	autoIndex: "eager",
	defaultIndexType: BasicIndex,
} as const;
const basicIndexConfig = { indexType: BasicIndex } as const;

const createIndexedCollection = ((
	config: Parameters<typeof createCollection>[0],
) =>
	createCollection({ ...config, ...indexDefaults })) as typeof createCollection;

const guardQuota = <T>(options: T): T =>
	withQuotaGuard(options, {
		reclaim: () => reclaimTerminalStateForQuota(),
		onPersistFailed: (storageKey) => notifyQuotaExhausted(storageKey),
	});

export interface LocalProductStateCollections {
	sidebarProjects: ReturnType<typeof createSidebarProjectsCollection>;
	workspaceLocalState: ReturnType<typeof createWorkspaceLocalStateCollection>;
	sidebarSections: ReturnType<typeof createSidebarSectionsCollection>;
	terminalPresets: ReturnType<typeof createTerminalPresetsCollection>;
	userPreferences: ReturnType<typeof createUserPreferencesCollection>;
}

// Compatibility boundary: these physical collection IDs and storage keys keep
// their existing v2 names so upgrades continue reading the same persisted rows.
function createSidebarProjectsCollection(scopeId: string) {
	const collection = createIndexedCollection(
		localStorageCollectionOptions(
			guardQuota({
				id: `v2_sidebar_projects-${scopeId}`,
				storageKey: `v2-sidebar-projects-${scopeId}`,
				schema: dashboardSidebarProjectSchema,
				getKey: (item: DashboardSidebarProjectRow) => item.projectId,
			}),
		),
	);
	collection.createIndex(
		(sidebarProject) => sidebarProject.tabOrder,
		basicIndexConfig,
	);
	return collection;
}

function createWorkspaceLocalStateCollection(scopeId: string) {
	const collection = createIndexedCollection(
		localStorageCollectionOptions(
			guardQuota(
				withReadHeal(
					{
						id: `v2_workspace_local_state-${scopeId}`,
						storageKey: `v2-workspace-local-state-${scopeId}`,
						schema: workspaceLocalStateSchema,
						getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
					},
					healWorkspaceLocalState,
				),
			),
		),
	);
	collection.createIndex(
		(localState) => localState.sidebarState.projectId,
		basicIndexConfig,
	);
	collection.createIndex(
		(localState) => localState.sidebarState.sectionId,
		basicIndexConfig,
	);
	collection.createIndex(
		(localState) => localState.sidebarState.tabOrder,
		basicIndexConfig,
	);
	return collection;
}

function createSidebarSectionsCollection(scopeId: string) {
	const collection = createIndexedCollection(
		localStorageCollectionOptions(
			guardQuota({
				id: `v2_sidebar_sections-${scopeId}`,
				storageKey: `v2-sidebar-sections-${scopeId}`,
				schema: dashboardSidebarSectionSchema,
				getKey: (item: DashboardSidebarSectionRow) => item.sectionId,
			}),
		),
	);
	collection.createIndex((section) => section.projectId, basicIndexConfig);
	collection.createIndex((section) => section.tabOrder, basicIndexConfig);
	return collection;
}

function createTerminalPresetsCollection(scopeId: string) {
	return createIndexedCollection(
		localStorageCollectionOptions(
			guardQuota({
				id: `v2_terminal_presets-${scopeId}`,
				storageKey: `v2-terminal-presets-${scopeId}`,
				schema: terminalPresetSchema,
				getKey: (item: TerminalPresetRow) => item.id,
			}),
		),
	);
}

function createUserPreferencesCollection(scopeId: string) {
	return createCollection(
		localStorageCollectionOptions(
			guardQuota(
				withReadHeal(
					{
						id: `v2_user_preferences-${scopeId}`,
						storageKey: `v2-user-preferences-${scopeId}`,
						schema: userPreferencesSchema,
						getKey: (item: UserPreferencesRow) => item.id as string,
					},
					healUserPreferences,
				),
			),
		),
	);
}

export const LOCAL_PRODUCT_STATE_COLLECTION_NAMES = [
	"sidebarProjects",
	"workspaceLocalState",
	"sidebarSections",
	"terminalPresets",
	"userPreferences",
] as const satisfies ReadonlyArray<keyof LocalProductStateCollections>;

const collectionsByScope = new Map<string, LocalProductStateCollections>();

export function getLocalProductStateCollections(
	scopeId: string,
): LocalProductStateCollections {
	const cached = collectionsByScope.get(scopeId);
	if (cached) return cached;

	const collections = {
		sidebarProjects: createSidebarProjectsCollection(scopeId),
		workspaceLocalState: createWorkspaceLocalStateCollection(scopeId),
		sidebarSections: createSidebarSectionsCollection(scopeId),
		terminalPresets: createTerminalPresetsCollection(scopeId),
		userPreferences: createUserPreferencesCollection(scopeId),
	};
	collectionsByScope.set(scopeId, collections);
	return collections;
}

export async function preloadLocalProductState(scopeId: string): Promise<void> {
	const collections = getLocalProductStateCollections(scopeId);
	await Promise.allSettled(
		LOCAL_PRODUCT_STATE_COLLECTION_NAMES.map((name) =>
			collections[name].preload(),
		),
	);
}

export type LocalCollections = LocalProductStateCollections;
