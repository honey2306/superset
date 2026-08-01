export { canonicalizeHostPath } from "./canonical-path";
export {
	canonicalizePath,
	generateIdentityCollisionReport,
	type IdentityCollisionReport,
	normalizeCatalogPathString,
} from "./collision-report";
export { runCatalogIdentityBackfill } from "./identity-backfill";
export {
	type CatalogEntityType,
	type CatalogEventType,
	CHANGES_PAGE_DEFAULT_LIMIT,
	CHANGES_PAGE_MAX_LIMIT,
	type ProjectSnapshotShape,
	type WorkspaceCatalogChange,
	type WorkspaceCatalogChangePage,
	type WorkspaceCatalogSnapshot,
	type WorkspaceSnapshotShape,
} from "./types";
export {
	CatalogIdentityConflictError,
	type ProjectPatch,
	type ProjectWriteInput,
	toProjectSnapshot,
	toWorkspaceSnapshot,
	WorkspaceCatalog,
	type WorkspaceCatalogDeps,
	type WorkspacePatch,
	type WorkspaceWriteInput,
} from "./workspace-catalog";
