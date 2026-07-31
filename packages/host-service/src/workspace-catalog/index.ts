export { canonicalizeHostPath } from "./canonical-path";
export {
	canonicalizePath,
	generateIdentityCollisionReport,
	normalizeCatalogPathString,
	type IdentityCollisionReport,
} from "./collision-report";
export { runCatalogIdentityBackfill } from "./identity-backfill";
export {
	CatalogIdentityConflictError,
	toProjectSnapshot,
	toWorkspaceSnapshot,
	WorkspaceCatalog,
	type ProjectPatch,
	type ProjectWriteInput,
	type WorkspaceCatalogDeps,
	type WorkspacePatch,
	type WorkspaceWriteInput,
} from "./workspace-catalog";
export {
	CHANGES_PAGE_DEFAULT_LIMIT,
	CHANGES_PAGE_MAX_LIMIT,
	type CatalogEntityType,
	type CatalogEventType,
	type ProjectSnapshotShape,
	type WorkspaceCatalogChange,
	type WorkspaceCatalogChangePage,
	type WorkspaceCatalogSnapshot,
	type WorkspaceSnapshotShape,
} from "./types";
