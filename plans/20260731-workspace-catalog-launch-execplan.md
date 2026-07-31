# ExecPlan: host-owned Workspace Catalog and Provisioning

Living implementation plan. Architecture and rationale:
`20260731-workspace-catalog-launch-architecture.md`.

## Goal

Replace every Workspace creation/adoption path with one durable host-owned
Workspace Provisioning Module, and replace Workspace identity reads with one
host-owned Workspace Catalog Module.

The end state is per-host authority, not a central database:

- each host has one Catalog in its own `host.db`;
- every Workspace is owned by exactly one host;
- a Project may be set up on multiple hosts under the same Project ID;
- the renderer fans out to hosts and builds a rebuildable projection;
- v1 panes remain a presentation shell and use canonical host Workspace IDs;
- Terminal Runtime remains the only owner of terminal sessions.

## Acceptance

With cloud networking disabled, a fresh desktop process can:

1. import, clone, or create a Project and open its main Workspace;
2. create a branch Workspace;
3. adopt an existing worktree;
4. create a PR Workspace;
5. open the singleton temporary Workspace;
6. start the requested setup, shell, command, or agent session;
7. survive a renderer restart without losing the operation;
8. survive a host restart without duplicating a Project, Workspace, worktree,
   branch, or terminal session.

The visible route, canonical Workspace ID, Catalog row, filesystem path, pane
projection, and Terminal Runtime ownership must agree. No normal path may write
Workspace identity to Electron local-db, repair an ID from a path, or require a
v1/v2 feature flag.

## Locked decisions

| # | Decision |
|---|---|
| 1 | `host.db` is the sole authority on a host. Renderer and IndexedDB data are projections. |
| 2 | Commands use a durable Workspace Provisioning Operation. Queries use a small Workspace Catalog Interface. |
| 3 | The host mints IDs for new Projects and Workspaces. `setup-existing` preserves an already-canonical cross-host Project ID. Only temporary compatibility Adapters may request a preserved Workspace ID. |
| 4 | Git + filesystem + SQLite + PTY is a saga with an explicit Catalog commit point, not a global transaction. |
| 5 | Provisioning may ask Terminal Runtime to ensure initial sessions, but Terminal Runtime owns their later lifecycle. |
| 6 | New clients never fall back to Electron Workspace creation. Old callers use deletable host compatibility Adapters during the migration. |
| 7 | No automatic destructive merge of identity collisions. Conflicts are recorded and block only the affected identity. |
| 8 | Existing imported/adopted/temporary directories are never removed by compensation. |
| 9 | Operation rows and idempotency receipts are retained. Sensitive launch payloads are cleared after successful terminal creation and are never logged. |
| 10 | New Project targets initially produce their main Workspace only. Creating an additional branch/PR Workspace is a second operation. This keeps invalid `ProjectTarget × WorkspaceSource` combinations out of callers. |

## Current-state evidence

The following command passed on 2026-07-31 in this worktree:

```bash
bun test \
  packages/host-service/test/integration/workspace-create-delete.integration.test.ts \
  packages/host-service/test/integration/workspace-create-pr.integration.test.ts \
  packages/host-service/test/integration/workspace-creation-adopt.integration.test.ts \
  packages/host-service/test/integration/project.integration.test.ts \
  packages/host-service/test/integration/setup-scripts.integration.test.ts
```

Result: 33 passed, 0 failed.

These tests are the initial characterization baseline. Some test names still
say “calls cloud” even though current creation is host-local; rename those test
descriptions in M0 without changing assertions.

Current important facts:

- `packages/host-service/src/trpc/router/workspaces/workspaces.ts` contains the
  main branch/worktree/PR saga and a process-local lock.
- `packages/host-service/src/trpc/router/project/handlers.ts` contains a second
  Project + main Workspace saga.
- `packages/host-service/src/trpc/router/workspace-creation/shared/adopt-existing-worktree.ts`
  contains a third registration path.
- `apps/desktop/src/renderer/stores/workspace-creates/useWorkspaceCreates.ts`
  assumes a renderer-minted ID is already canonical.
- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts` still owns
  the legacy Electron local-db creation implementation.
- `workspace:changed` and `project:changed` are lossy WebSocket notifications;
  they have no revision or replay.
- `createTerminalSessionInternal` already supports caller-supplied session IDs
  and adopts the same daemon session after host restart. Reuse it as the
  Terminal Runtime Adapter.
- `createApp` already has a real SQLite test harness and injectable GitHub/gh
  dependencies. Extend that harness; do not replace local dependencies with
  mocks.

## Target Interface

The transport surface is four tRPC procedures plus two event types. The
Workspace Provisioning client composes these into the `begin/get/watch/retry`
Interface from the architecture document.

```ts
workspaceProvisioning.begin(request): Promise<{ operationId: string }>
workspaceProvisioning.get({ operationId }): Promise<WorkspaceOperation>
workspaceProvisioning.list({ states? }): Promise<WorkspaceOperation[]>
workspaceProvisioning.act({ operationId, action: "retry" | "cancel" }): Promise<WorkspaceOperation>

workspaceCatalog.snapshot(): Promise<WorkspaceCatalogSnapshot>
workspaceCatalog.changes({ afterRevision, limit? }): Promise<WorkspaceCatalogChangePage>
```

Event bus additions:

```ts
type WorkspaceOperationChangedMessage = {
	type: "workspace-operation:changed";
	operationId: string;
	revision: number;
	operation: WorkspaceOperation;
};

type CatalogChangedMessage = {
	type: "catalog:changed";
	revision: number;
};
```

`catalog:changed` is a wake-up notification, not the durable payload. A client
calls `workspaceCatalog.changes` to replay from its last revision. If the
client has no cursor, it calls `snapshot`, installs the snapshot atomically,
then asks for changes after the returned revision.

Operation events carry the current operation snapshot. On reconnect the client
calls `get`; intermediate stage transitions are presentation hints and do not
need a separate durable event log.

### Wire types

Implement these discriminated unions in
`packages/host-service/src/workspace-provisioning/types.ts` and use them from
the Zod schemas. Do not maintain a second handwritten renderer copy.

```ts
type ProjectTarget =
	| { kind: "existing"; projectId: string }
	| {
			kind: "setup-existing";
			projectId: string;
			origin: { repoUrl?: string; name?: string };
			mode:
				| { kind: "clone"; parentDirectory: string }
				| { kind: "import"; path: string; allowRelocate?: boolean };
	  }
	| {
			kind: "import";
			path: string;
			name: string;
			git: "require" | "initialize-with-consent";
	  }
	| { kind: "clone"; url: string; parentDirectory: string; name: string }
	| { kind: "empty"; parentDirectory: string; name: string }
	| { kind: "template"; url: string; parentDirectory: string; name: string }
	| { kind: "temporary"; singletonKey: "default" };

type WorkspaceSource =
	| { kind: "main" }
	| {
			kind: "branch";
			name:
				| { kind: "explicit"; value: string }
				| { kind: "generated"; prompt?: string };
			from:
				| { kind: "default" }
				| { kind: "ref"; value: string };
	  }
	| { kind: "worktree"; path: string; expectedBranch?: string }
	| { kind: "pull-request"; provider: "github"; number: number };

type InitialSessionIntent =
	| {
			key: string;
			kind: "setup";
			requirement: "required" | "best-effort";
	  }
	| {
			key: string;
			kind: "shell";
			label?: string;
			requirement: "required" | "best-effort";
	  }
	| {
			key: string;
			kind: "command";
			command: string;
			label?: string;
			requirement: "required" | "best-effort";
	  }
	| {
			key: string;
			kind: "agent";
			agent: string;
			prompt: string;
			attachmentIds?: string[];
			model?: string;
			effort?: string;
			requirement: "required" | "best-effort";
	  };

interface ProvisionWorkspaceRequest {
	idempotencyKey: string; // 1..200 characters
	project: ProjectTarget;
	source: WorkspaceSource;
	display?: { name?: string; taskId?: string };
	existing?: {
		workspace: "reuse" | "fail";
		worktree: "adopt" | "fail";
	};
	initialSessions?: InitialSessionIntent[];
}

type WorkspaceOperationState =
	| "queued"
	| "running"
	| "compensating"
	| "succeeded"
	| "failed"
	| "cancelled";

type WorkspaceOperationStage =
	| "resolving"
	| "materializing"
	| "cataloging"
	| "initializing"
	| "starting-runtime"
	| "compensating";

type InitialLaunchResult =
	| {
			key: string;
			kind: "terminal";
			sessionId: string;
			role: "setup" | "shell" | "command" | "agent";
			label?: string;
			attachable: true;
	  }
	| {
			key: string;
			kind: "chat";
			sessionId: string;
			label?: string;
	  };

interface WorkspaceOperation {
	id: string;
	revision: number;
	state: WorkspaceOperationState;
	stage?: WorkspaceOperationStage;
	projectId?: string;
	workspaceId?: string;
	disposition?: "created" | "adopted" | "reused" | "repaired";
	progress?: { label: string; completed: number; total?: number };
	launches: InitialLaunchResult[];
	warnings: Array<{ code: string; message: string }>;
	failure?: WorkspaceOperationFailure;
	createdAt: number;
	updatedAt: number;
	completedAt?: number;
}
```

Defaults are `existing.workspace="reuse"` and
`existing.worktree="adopt"`, matching current re-entry behavior. Session keys
must be unique within one request. `prompt` or `command` data must never appear
in `WorkspaceOperation`, events, warnings, or logs.

Catalog transport types live in
`packages/host-service/src/workspace-catalog/types.ts`:

```ts
interface ProjectSnapshot {
	id: string;
	kind: "repository" | "temporary";
	singletonKey: string | null;
	name: string;
	repoPath: string;
	repoProvider: string | null;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	remoteName: string | null;
	worktreeBaseDir: string | null;
	branchPrefixMode: "none" | "github" | "author" | "custom" | null;
	branchPrefixCustom: string | null;
	createdAt: number;
	updatedAt: number;
}

interface WorkspaceSnapshot {
	id: string;
	projectId: string;
	name: string;
	type: "main" | "worktree";
	worktreePath: string;
	branch: string;
	headSha: string | null;
	upstreamOwner: string | null;
	upstreamRepo: string | null;
	upstreamBranch: string | null;
	pullRequestId: string | null;
	taskId: string | null;
	createdByUserId: string | null;
	createdAt: number;
	updatedAt: number;
}

interface WorkspaceCatalogSnapshot {
	schemaVersion: 1;
	revision: number;
	projects: ProjectSnapshot[];
	workspaces: WorkspaceSnapshot[];
	health: { unresolvedIdentityConflicts: number };
}

interface WorkspaceCatalogChange {
	schemaVersion: 1;
	revision: number;
	entityType: "project" | "workspace";
	entityId: string;
	eventType: "created" | "updated" | "deleted";
	snapshot: ProjectSnapshot | WorkspaceSnapshot | null;
	occurredAt: number;
}

interface WorkspaceCatalogChangePage {
	changes: WorkspaceCatalogChange[];
	nextRevision: number;
	hasMore: boolean;
}
```

Read the snapshot rows and maximum revision in one SQLite read transaction.
`changes` sorts ascending by revision and returns at most 200 by default, 500
maximum. `nextRevision` is the last returned revision, or the requested cursor
when the page is empty.

`workspaceProvisioning.list` never accepts a caller-supplied machine ID. It
filters by `ctx.clientMachineId` and rejects when that header is absent. Direct
operation `get/act` remains available to automation using the unguessable
operation ID returned by `begin`.

## Request compatibility matrix

| Project target | Allowed Workspace source | Current implementation reused |
|---|---|---|
| `existing` | `main`, `branch`, `worktree`, `pull-request` | `workspaces.create`, `adoptExistingWorktree`, `ensureMainWorkspaceStrict` |
| `setup-existing` | `main` only | `project.setup` |
| `import` | `main` only | `createFromImportLocal` |
| `clone` | `main` only | `createFromClone` |
| `empty` | `main` only | `createFromEmpty` |
| `template` | `main` only | `createFromTemplate` |
| `temporary` | `main` only | host-side replacement for Electron `ensureTemporaryWorkspace` |

Reject other combinations with `INVALID_SOURCE` before creating artifacts.

## Operation state machine

```text
queued --> running -------------------------------> succeeded
             |   |                                      ^
             |   `--> failed(retryable) --> queued -----'
             |
             `--> compensating --> failed | cancelled

cancel before Catalog commit: queued/running -> compensating -> cancelled
cancel after Catalog commit: TOO_LATE_TO_CANCEL
```

Stages are `resolving`, `materializing`, `cataloging`, `initializing`,
`starting-runtime`, and `compensating`. Callers may display them but may not
branch workflow behavior on them.

The operation exposes `workspaceId` as soon as the Catalog commit succeeds,
even while initial sessions are still starting. The renderer may navigate at
that point and show operation progress. It writes the final pane projection
only from journaled, attachable session results.

Initial session intents carry `requirement: "required" | "best-effort"`.
Compatibility Adapters use `best-effort` to preserve current behavior. A
required failure produces a retryable failed operation with `workspaceId`
present; it never rolls back the committed Workspace.

## Database design

Modify `packages/host-service/src/db/schema.ts`, then stop at the repository's
database safety gate and ask the user to run:

```bash
bun run --cwd packages/host-service generate
```

The implementing agent must not run this command and must not hand-edit
generated SQL, snapshots, or `_journal.json`. After the user generates the
migration, inspect the generated artifacts before continuing. The current next
migration is expected to be `0012`; if another migration lands first, accept
the number generated by Drizzle.

### Catalog identity additions

Add to `projects`:

```text
kind                     text not null default 'repository'
singleton_key            text null
canonical_repo_path      text null
```

Add unique indexes:

```text
projects_canonical_repo_path_unique(canonical_repo_path)
projects_singleton_key_unique(singleton_key) WHERE singleton_key IS NOT NULL
```

Add to `workspaces`:

```text
canonical_worktree_path  text null
```

Add unique index:

```text
workspaces_canonical_worktree_path_unique(canonical_worktree_path)
  WHERE canonical_worktree_path IS NOT NULL
```

The new canonical columns are nullable so the migration cannot brick an
existing installation that already contains duplicates. New writes always set
them. `runCatalogIdentityBackfill` fills old rows one at a time; on a unique
collision it leaves the losing row null and records a conflict instead of
merging or deleting it.

Add `catalog_identity_conflicts`:

```text
id                text primary key
entity_type       text not null       -- project | workspace
entity_id         text not null
canonical_key     text not null
conflicting_id    text not null
reason            text not null
detected_at       integer not null
resolved_at       integer null
```

Add a unique index on `(entity_type, entity_id, canonical_key)`.

### Catalog change journal

Add `catalog_changes`:

```text
revision          integer primary key autoincrement
schema_version    integer not null default 1
entity_type       text not null       -- project | workspace
entity_id         text not null
event_type        text not null       -- created | updated | deleted
snapshot_json     text null           -- null for delete
occurred_at       integer not null
```

The entity write and its `catalog_changes` row happen in the same SQLite
transaction. Broadcast `catalog:changed` only after commit. A crash after
commit but before broadcast is healed by `snapshot/changes`.

Deleting a Project writes deletion changes for each cascaded Workspace in
stable Workspace-ID order, then the Project deletion change, all in the same
transaction. Broadcast only the final highest revision; replay returns every
individual change.

Keep the journal indefinitely in the first implementation. Do not add
retention until a compaction protocol and minimum supported cursor exist.

### Provisioning journal

Add `workspace_operations`:

```text
id                          text primary key
idempotency_key             text not null unique
request_hash                text not null
request_json                text not null  -- canonical redacted request
launch_payload_json         text null      -- resumable command/prompt payload
requested_by_machine_id     text null
state                       text not null
stage                       text null
revision                    integer not null default 1
project_id                  text null
workspace_id                text null
planned_project_id          text null
planned_workspace_id        text null
catalog_committed_at        integer null
lease_owner                 text null
lease_expires_at            integer null
cancel_requested_at         integer null
failure_code                text null
failure_class               text null
failure_retryable           integer null
failure_message             text null
cleanup_state               text null
result_json                 text null
created_at                  integer not null
updated_at                  integer not null
completed_at                integer null
```

IDs in the operation table deliberately have no foreign keys. Planned IDs must
exist before Catalog rows, and completed receipts must remain interpretable
after a Workspace is later deleted.

Add `workspace_operation_steps`:

```text
operation_id       text not null references workspace_operations(id) on delete cascade
step_key           text not null
status             text not null       -- planned | running | completed
attempt             integer not null default 0
input_json          text null
output_json         text null
started_at          integer null
completed_at        integer null
primary key(operation_id, step_key)
```

Add `workspace_operation_artifacts`:

```text
id                  text primary key
operation_id        text not null references workspace_operations(id) on delete cascade
kind                text not null       -- repo-dir | worktree | branch | terminal
identity            text not null       -- canonical path, ref, or session id
ownership           text not null       -- created | adopted
expected_head_sha   text null
cleanup_state       text not null       -- not-needed | pending | complete | incomplete
created_at          integer not null
updated_at          integer not null
```

Add a unique index on `(operation_id, kind, identity)`.

Add `workspace_operation_locks`:

```text
lock_key            text primary key
operation_id        text not null references workspace_operations(id) on delete cascade
lease_owner         text not null
lease_expires_at    integer not null
```

The operation lease prevents two workers from executing one operation. The
natural-identity lock prevents different operations from mutating the same
Project/path/explicit branch/PR concurrently. A short-lived repository Git
lock serializes unsafe writes to shared Git metadata even when the operations
target different branches. The table supports multiple lock rows for one
operation.

## Canonicalization and idempotency

Create a server-only canonical request encoder that:

1. validates the compatibility matrix;
2. trims display strings and branch/ref inputs;
3. normalizes enum defaults explicitly;
4. canonicalizes filesystem paths on the target host;
5. recursively sorts object keys;
6. hashes the complete canonical request with SHA-256.

Filesystem canonicalization is deterministic and host-local: resolve to an
absolute path; for an existing path use the native real path; for a path that
does not exist, real-path the nearest existing ancestor and append normalized
remaining segments; remove trailing separators except at a filesystem root.
Do not lowercase paths. After materialization, canonicalize again from Git
read-back and use that value for the Catalog transaction. Tests cover symlink,
relative-path, trailing-separator, and case-alias behavior on the current
filesystem.

An existing idempotency key with the same hash returns its operation. The same
key with a different hash throws `IDEMPOTENCY_CONFLICT`. Never compare raw JSON
strings and never log `request_json` or `launch_payload_json`.

`request_hash` is computed over the complete request, including launch intent,
but `request_json` stores a canonical redacted copy: command and prompt values
are replaced with their SHA-256 digests and attachment IDs are omitted.
`launch_payload_json` is the only durable plaintext copy of data required to
resume initial terminal or agent launch. Never return or log that column. Clear
it after all requested sessions are attachable, on cancellation, or when an
operation enters a terminal non-retryable failure. A retryable failed operation
retains it because restart recovery would otherwise be dishonest.

Natural lock keys:

```text
temporary:<singletonKey>
project-path:<canonical target path>
project:<projectId>:main
project:<projectId>:branch:<explicit normalized branch>
project:<projectId>:worktree:<canonical worktree path>
project:<projectId>:pr:github:<number>
git-repo:<canonical repository path>
```

The first six keys are long-lived identity leases. If a different active
operation owns one, return `RESOURCE_BUSY` with the active operation ID. Do not
silently combine operations with different launch payloads.

`git-repo:*` is a short critical-section lease, not an identity conflict.
Every source handler acquires it immediately before a command that mutates the
repository's shared Git metadata and releases it after Git read-back. A worker
that cannot acquire it remains queued and retries with bounded jitter; `begin`
does not fail. Generated-branch operations therefore retain independent
identity while still avoiding `.git/config`, refs, and worktree-list races.
Acquire lock classes only in this order: operation lease, identity lease, Git
lease. Sort multiple keys lexically within a class and release in reverse order.

## Commit and compensation rules

Order every operation as follows:

1. canonicalize request and claim the idempotency key;
2. claim operation and natural-identity leases;
3. resolve source and conflicts without mutation;
4. journal planned IDs, terminal IDs, paths, refs, and ownership;
5. materialize or adopt Git/filesystem artifacts;
6. read back actual repo root, worktree root, branch, and HEAD from Git;
7. write Project/Main Workspace/target Workspace plus Catalog changes in one
   SQLite transaction; set `catalog_committed_at` in that transaction;
8. run idempotent config/setup resolution;
9. ensure journaled terminal sessions through Terminal Runtime;
10. mark success, clear sensitive launch payload, broadcast operation change,
    and release leases.

Step 5 acquires the short `git-repo:*` lease around Git mutations and step 6,
then releases it before the Catalog transaction. It never holds a SQLite write
transaction while waiting for a filesystem or Git lock.

Before step 7, compensation may remove only artifacts with
`ownership='created'`:

- clone/empty/template repo directories;
- worktrees created by the operation;
- PR branches created by the operation, only when HEAD still equals the
  journaled expected SHA;
- terminal sessions created before an early failure.

It must never remove import/adopt/temporary paths or a branch/worktree recorded
as adopted.

After step 7, never remove the Workspace or user files. Retry resumes setup and
Terminal Runtime steps from the journal. `cancel` returns
`TOO_LATE_TO_CANCEL`.

## File map

### New host Modules

Create:

```text
packages/host-service/src/workspace-catalog/
  index.ts
  types.ts
  workspace-catalog.ts
  canonical-path.ts
  identity-backfill.ts
  workspace-catalog.test.ts

packages/host-service/src/workspace-provisioning/
  index.ts
  types.ts
  canonical-request.ts
  operation-journal.ts
  workspace-provisioning.ts
  resume-worker.ts
  compensation.ts
  terminal-runtime-adapter.ts
  sources/
    existing-project.ts
    project-materializers.ts
    branch.ts
    worktree.ts
    pull-request.ts
    temporary.ts

packages/host-service/src/trpc/router/workspace-catalog/
  index.ts
  workspace-catalog.ts

packages/host-service/src/trpc/router/workspace-provisioning/
  index.ts
  schemas.ts
  workspace-provisioning.ts
```

`workspace-catalog.ts` is the only normal writer of Project/Workspace identity
and display fields. It uses real `HostDb`; do not introduce a repository
Interface with only one Adapter. Tests run against migrated SQLite.

`terminal-runtime-adapter.ts` is a real internal Seam because it has two
Adapters: production wraps `createTerminalSessionInternal` /
`runAgentInWorkspace`; provisioning tests inject a deterministic fake.

### Existing host files to modify

```text
packages/host-service/src/db/schema.ts
packages/host-service/src/app.ts
packages/host-service/src/types.ts
packages/host-service/src/index.ts
packages/host-service/src/events/types.ts
packages/host-service/src/events/event-bus.ts
packages/host-service/src/events/index.ts
packages/host-service/src/trpc/router/router.ts
packages/host-service/src/trpc/router/workspaces/workspaces.ts
packages/host-service/src/trpc/router/workspace/workspace.ts
packages/host-service/src/trpc/router/project/project.ts
packages/host-service/src/trpc/router/project/handlers.ts
packages/host-service/src/trpc/router/project/utils/persist-project.ts
packages/host-service/src/trpc/router/project/utils/ensure-main-workspace.ts
packages/host-service/src/trpc/router/workspace-creation/procedures/adopt.ts
packages/host-service/src/trpc/router/workspace-creation/shared/adopt-existing-worktree.ts
packages/host-service/src/workspaces/local-workspace-store.ts
packages/host-service/src/projects/local-project-store.ts
packages/host-service/src/runtime/project-backfill.ts
packages/host-service/src/runtime/workspace-backfill.ts
packages/host-service/src/runtime/pull-requests/pull-requests.ts
packages/host-service/test/helpers/createTestHost.ts
packages/host-service/test/helpers/scenarios.ts
packages/host-service/test/helpers/seed.ts
```

Do not move pure branch/Git algorithms merely to make the diff look new. Reuse
the existing files under `workspace-creation/shared` and
`workspace-creation/utils` from the source handlers.

### New client/renderer Modules

Create:

```text
packages/workspace-client/src/lib/workspaceProvisioning.ts
packages/workspace-client/src/lib/workspaceProvisioning.test.ts

apps/desktop/src/renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/
  WorkspaceCatalogProvider.tsx
  index.ts
  catalogProjection.ts
  catalogProjection.test.ts

apps/desktop/src/renderer/stores/workspace-launch/
  index.ts
  useWorkspaceLaunch.ts
  workspaceLaunchStore.ts
  writeWorkspacePaneLayout.ts
  workspaceLaunchStore.test.ts
```

The production Workspace Provisioning Adapter uses tRPC plus the event bus.
Tests use an in-memory Adapter implementing the same client Interface. That
makes the remote Seam real without mocking SQLite/Git/filesystem behavior.

### Existing client/renderer files to modify

```text
packages/workspace-client/src/lib/eventBus.ts
packages/workspace-client/src/index.ts
apps/desktop/src/renderer/routes/_authenticated/layout.tsx
apps/desktop/src/renderer/stores/workspace-creates/useWorkspaceCreates.ts
apps/desktop/src/renderer/stores/workspace-creates/index.ts
apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts
apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts
apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.ts
apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/hooks/useBranchPickerController/useBranchPickerController.ts
apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopoverV2/RunInWorkspacePopoverV2.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunIssuesInWorkspacePopover/RunIssuesInWorkspacePopover.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/components/NewProjectModal/NewProjectModal.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport/useFolderFirstImport.ts
apps/desktop/src/renderer/routes/_authenticated/components/TemplateGalleryModal/TemplateGalleryModal.tsx
apps/desktop/src/renderer/hooks/useEnsureV2Project/useEnsureV2Project.ts
apps/desktop/src/renderer/react-query/projects/useFinalizeProjectSetup/useFinalizeProjectSetup.ts
apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx
packages/trpc/src/router/automation/dispatch.ts
packages/shared/src/host-version.ts
```

The `$workspaceId` path above is literal; quote it in shell commands.

## Milestones

### M0 — characterization and collision audit

Add:

```text
packages/host-service/test/integration/workspace-provisioning-characterization.integration.test.ts
packages/host-service/test/integration/workspace-catalog-identity.integration.test.ts
```

Characterize these behaviors through current tRPC Interfaces before moving
Implementation:

- new branch from default, explicit base, existing local branch, and remote
  tracking branch;
- same branch re-entry returns one Workspace;
- concurrent same explicit branch returns one Workspace;
- different branches may create concurrently without `.git/config` failure;
- explicit worktree path is read back from Git and adopted;
- PR same-repo, fork, archived ref, wrong local HEAD, and concurrent PR create;
- Project clone/import/init/empty/template creates exactly one main Workspace;
- SQLite Workspace insert failure removes only the newly created worktree;
- Project persistence failure removes clone/empty/template output but never an
  imported directory;
- setup, command, and agent launch failure preserves the Workspace;
- local create succeeds with cloud unavailable.

Add a read-only collision report helper and test it against duplicate repo and
worktree paths. M0 does not mutate production data.

Exit gate:

```bash
bun test packages/host-service/test/integration/workspace-provisioning-characterization.integration.test.ts
bun test packages/host-service/test/integration/workspace-catalog-identity.integration.test.ts
bun test packages/host-service/test/integration/workspace-create-delete.integration.test.ts packages/host-service/test/integration/workspace-create-pr.integration.test.ts packages/host-service/test/integration/workspace-creation-adopt.integration.test.ts packages/host-service/test/integration/project.integration.test.ts packages/host-service/test/integration/setup-scripts.integration.test.ts
```

All must pass before M1.

### M1 — deep Workspace Catalog, no caller migration

1. Add canonical identity columns, conflict table, and Catalog change journal.
2. Stop and ask the user to generate the host migration as described in the
   Database design section; inspect it after generation.
3. Implement `WorkspaceCatalog` with transactional entity write + change row.
4. Run synchronous identity backfill before tRPC routes accept requests.
5. Add `workspaceCatalog.snapshot/changes` and `catalog:changed`.
6. Route the following identity/display writes through the Catalog Module:
   `persistLocalProject`, `ensureMainWorkspaceStrict`, local Workspace
   insert/update/delete, Project rename/delete, backfills, and branch changes
   detected by PullRequestRuntime.
7. Keep metadata-only PR fields (`headSha`, upstream coordinates,
   `pullRequestId`) as internal direct updates unless a display/identity field
   changes in the same write.
8. Keep existing `project.*`, `workspace.*`, `workspaces.create`, and
   `workspaceCreation.adopt` Interfaces unchanged.

Fix the current `workspaces.create` call from tolerant
`ensureMainWorkspace(...)` to strict semantics through the Catalog. A create
operation may not continue after failing to establish the main Workspace.

Exit gate:

- the 33-test baseline still passes;
- a Catalog write and its change row commit or roll back together;
- dropped WebSocket events replay through `changes`;
- duplicate historical paths are reported, not deleted and not allowed for
  new writes;
- `workspace.list` and `project.list` remain response-compatible.

Run:

```bash
bun test packages/host-service/src/workspace-catalog packages/host-service/test/integration
bun run --cwd packages/host-service typecheck
```

### M2 — durable Provisioning behind compatibility Adapters

1. Add the operation journal schema, then stop and ask the user to generate the
   next migration; inspect it after generation.
2. Implement canonical request hashing, leases, checkpoints, artifacts,
   compensation, and resume worker.
3. Extract the current branch/worktree/PR logic from the large tRPC mutation
   into source handlers behind Workspace Provisioning. Preserve the tested Git
   algorithms rather than rewriting them.
4. Move Project materializers from `project/handlers.ts` behind the same
   Provisioning Module.
5. Add the `temporary/default` materializer at
   `<homedir>/Superset/temporary`; mark the directory adopted, not owned.
6. Journal terminal IDs before calling Terminal Runtime. Production uses the
   existing fixed-ID create/adopt behavior.
7. In `createApp`, enforce startup order: migrate/open DB, run Catalog identity
   backfill, construct Catalog and Provisioning, start EventBus, then start the
   resume worker. Register tRPC routes only against those constructed Modules.
   On `dispose`, stop accepting work, stop and await the worker, then close
   EventBus/GitWatcher/DB.
8. Add `workspaceProvisioning.*` tRPC procedures and operation events.
9. Convert old host procedures into compatibility Adapters:

   - `workspaces.create`: map `input.id` to
     `legacy-create:<id>` and internally preserve that Workspace ID; wait for
     terminal completion and return the old result shape.
   - `workspaceCreation.adopt`: map to an explicit worktree request; the
     existing ID option is privileged compatibility input only.
   - `project.create`: accept an additive optional `idempotencyKey`; map modes
     to Provisioning and return the old synchronous result.
   - `project.setup`: map to `setup-existing` and return the old result.

The new public Provisioning request never exposes `plannedWorkspaceId` or
`plannedProjectId`.

Extend `createTestHost` with a caller-owned database fixture:

- `dbPath` optional input;
- `removeDbOnDispose` default true;
- `stop()` closes app and SQLite but preserves caller-owned files;
- `dispose()` performs final cleanup.

Use it for real restart tests. Do not simulate recovery with renderer promises.

Add:

```text
packages/host-service/test/integration/workspace-provisioning.integration.test.ts
packages/host-service/test/integration/workspace-provisioning-recovery.integration.test.ts
packages/host-service/test/integration/workspace-provisioning-terminal.integration.test.ts
```

Required recovery cases:

- same key/same request returns one operation;
- same key/different request returns `IDEMPOTENCY_CONFLICT`;
- two operations for the same natural lock return `RESOURCE_BUSY`;
- host stops after worktree creation but before Catalog commit, then resumes;
- host stops after Catalog commit but before terminal creation, then resumes;
- retry uses the journaled terminal ID and adopts, never duplicates;
- compensation never removes adopted paths;
- cancel before commit compensates; cancel after commit is rejected;
- operation list recovers a request whose HTTP response was lost.

Exit gate:

```bash
bun test packages/host-service/src/workspace-provisioning packages/host-service/test/integration/workspace-provisioning.integration.test.ts packages/host-service/test/integration/workspace-provisioning-recovery.integration.test.ts packages/host-service/test/integration/workspace-provisioning-terminal.integration.test.ts
bun test packages/host-service/test/integration
bun run --cwd packages/host-service typecheck
```

Compatibility tests must prove old procedure output is unchanged.

### M3 — new client Launch Coordinator

1. Add Workspace Provisioning event support to `@superset/workspace-client`.
2. Implement the production client Adapter and in-memory test Adapter.
3. Implement `useWorkspaceLaunch`:
   - call `begin` with a renderer-generated idempotency key;
   - recover active operations with `list` filtered by
     `requestedByMachineId`;
   - reconcile events with `get` after reconnect;
   - expose pending/committed/succeeded/failed projections;
   - navigate only to the host-returned canonical Workspace ID;
   - write pane layout from attachable result sessions.
4. Replace the four current `useWorkspaceCreates` callers and Project creation
   callers listed in the file map.
5. Replace the temporary Workspace Electron mutation with
   `{ project: { kind: "temporary", singletonKey: "default" }, source: { kind:
   "main" } }`.
6. Change automation dispatch to:
   - use idempotency key `automation-run:<runId>:workspace`;
   - call `workspaceProvisioning.begin` over relay;
   - poll `get` with bounded backoff until committed/succeeded/failed;
   - treat a committed Workspace plus required terminal failure as retryable;
   - stop calling `workspaces.create`.
7. Raise `MIN_HOST_SERVICE_VERSION` to the release containing Provisioning.
   New clients show upgrade-required for older remote hosts; they do not fall
   back to Electron creation.

Remove the optimistic canonical Workspace row from
`useWorkspaceCreates`. Pending UI now renders an operation projection. Remove
`failedWorkspaceCreates` after all its readers are replaced by operation
failures. Keep `workspaceTransactions` only for unrelated collection writes.

Exit gate:

- losing the `begin` HTTP response still recovers the operation from the host;
- renderer reload during every stage reconnects without duplicate work;
- failed pre-commit operation never creates a routable Workspace;
- post-commit terminal failure routes to the Workspace and exposes retry;
- every migrated caller uses the same Launch Coordinator Interface.

Run:

```bash
bun test packages/workspace-client/src/lib/workspaceProvisioning.test.ts apps/desktop/src/renderer/stores/workspace-launch
bun run --cwd packages/workspace-client typecheck
bun run --cwd apps/desktop typecheck
bun test packages/trpc/src/router/automation
```

### M3b — v1 shell consumes the Catalog projection

Create `WorkspaceCatalogProvider` by combining the current host Project and
Workspace fan-out behavior:

1. one `workspaceCatalog.snapshot` query per host;
2. one IndexedDB snapshot per organization + host;
3. one `catalog:changed` listener per host;
4. gap recovery through `workspaceCatalog.changes`;
5. cache-first rendering: existing rows render while a host is not ready;
6. local presentation state joins by canonical Workspace ID from
   `v2WorkspaceLocalState` and sidebar section collections.

Provide:

```ts
useWorkspaceCatalog(): {
	projects: ProjectProjection[];
	workspaces: WorkspaceProjection[];
	isReady: boolean;
	resolveHostUrl(hostId: string): string | null;
}

useWorkspaceProjection(workspaceId: string): WorkspaceProjection | null
```

Subscribe before installing the initial snapshot. Track the highest revision
seen by the event listener while the snapshot request is in flight, install the
snapshot at revision N atomically, then drain `changes` until the cursor reaches
the recorded high-water mark. Keep the existing 30-second background refetch as
a healing path; it must use `networkMode: "always"`.

Replace Electron identity queries in the files listed in Appendix A. Do not
mirror host Workspace identity back into Electron `projects/worktrees/workspaces`
tables.

Specific replacements:

- `get`, `getAll`, `getAllGrouped`, previous/next ordering: Catalog projection
  plus `v2WorkspaceLocalState`/section presentation state.
- branch/worktree picker: `workspaceCreation.searchBranches` and
  `workspaceCreation.listProjectWorktrees`.
- Git status, ahead/behind, PR status/comments: host `git.*` and
  `pullRequests.*` procedures using canonical Workspace ID.
- run definitions: refactor the existing pure
  `selectWorkspaceRunDefinition` caller to accept Catalog Project/Workspace
  paths plus local terminal presets; it must not query Electron Workspace
  identity.
- initialization UI: read Workspace Provisioning operation state; remove
  “`worktree.gitStatus === null` means incomplete initialization”.

Remove the route loader that calls `electronTrpcClient.workspaces.get`. The
route renders loading only when no projection exists and the relevant host
snapshot is not ready; a known operation may render its progress before the
Workspace projection arrives.

Exit gate: `rg` returns no renderer identity reads:

```bash
rg -n 'electronTrpc(Client)?\.workspaces\.(get|getAll|getAllGrouped|getPreviousWorkspace|getNextWorkspace)' apps/desktop/src/renderer
```

Expected result: no matches.

### M4 — remove compatibility authority

After M3/M3b ship together with the matching host version:

1. Delete `useWorkspaceCreates` and the `workspace-creates` failed-create
   storage. Move the pane-layout writer under `workspace-launch`.
2. Delete normal callers of host `workspaces.create`, `project.create`,
   `project.setup`, and `workspaceCreation.adopt`.
3. Delete those compatibility procedures once automation and supported
   clients use Provisioning. Keep branch/PR search procedures.
4. Delete the Electron creation Implementation:

```text
apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts
apps/desktop/src/lib/trpc/routers/workspaces/utils/workspace-creation.ts
apps/desktop/src/renderer/react-query/workspaces/useCreateWorkspace.ts
apps/desktop/src/renderer/react-query/workspaces/useCreateFromPr.ts
apps/desktop/src/renderer/screens/main/components/WorkspaceInitEffects.tsx
apps/desktop/src/renderer/stores/workspace-init.ts
```

Delete additional legacy init/setup helpers only after `rg` proves they have no
non-test callers.

5. Remove `projects.ensureTemporaryWorkspace` and
   `projects.getTemporaryWorkspace` from the Electron router.
6. Remove renderer reads/writes of Electron Workspace identity tables. Do not
   drop local-db tables in this milestone; sidebar/preset/user state may still
   use adjacent tables and a destructive migration is unnecessary.
7. Remove capability/compatibility code, privileged ID input, and comments that
   describe a live v1→v2 migration.

The current worktree already deletes the old `renderer/lib/v1-migration` and
`V1ImportModal` files. Do not restore them. This plan does not require an
automatic boot migration. Existing on-disk worktrees are recovered through the
normal explicit adopt flow, which returns canonical host IDs.

Exit gate:

```bash
rg -n 'workspaces\.create|project\.create|project\.setup|workspaceCreation\.adopt' apps/desktop/src/renderer packages/trpc/src
rg -n 'localDb\.(insert|update|delete)\((projects|workspaces|worktrees)\)' apps/desktop/src/lib/trpc/routers
```

Every remaining match must be either a test fixture or documented local
presentation metadata. No Workspace identity writer may remain.

### M5 — end-to-end evidence and cleanup

Run the full static and automated gates:

```bash
bun run lint:fix
bun run lint
bun run typecheck
bun test
bun run --cwd packages/host-service test:integration
```

`bun run lint` must exit 0 with no warnings before any push.

Perform CDP verification against the desktop instance from this exact worktree.
Before testing, record:

- `pwd` and current commit;
- renderer URL and port;
- active route;
- signed-in organization and selected host;
- host-service version/capabilities;
- whether cloud networking is disabled.

For each acceptance journey, capture:

- before and after screenshots;
- route and canonical Workspace ID;
- operation ID/state/revision;
- Catalog revision and row;
- canonical repo/worktree path;
- Terminal Runtime session IDs and ownership;
- restart boundary exercised.

Journeys:

1. main Workspace;
2. new branch;
3. existing worktree adoption;
4. folder import with and without confirmed Git initialization;
5. clone, empty, and template Project;
6. PR checkout including fork PR;
7. singleton temporary Workspace;
8. offline create/rename/delete/open;
9. renderer restart during materialization and terminal startup;
10. host restart before and after Catalog commit;
11. terminal failure followed by retry;
12. close/reopen with no duplicate PTY.

Do not claim verification unless the original interaction fails before the
relevant cutover and passes after it under the same observations.

## Error contract

Every accepted operation persists a structured failure:

```ts
type WorkspaceOperationFailure = {
	code:
		| "IDEMPOTENCY_CONFLICT"
		| "RESOURCE_BUSY"
		| "INVALID_SOURCE"
		| "PROJECT_NOT_FOUND"
		| "IDENTITY_CONFLICT"
		| "NOT_A_GIT_REPOSITORY"
		| "DETACHED_HEAD"
		| "REF_NOT_FOUND"
		| "BRANCH_CONFLICT"
		| "WORKTREE_CONFLICT"
		| "PR_UNAVAILABLE"
		| "AUTH_REQUIRED"
		| "FILESYSTEM_DENIED"
		| "DISK_FULL"
		| "CATALOG_COMMIT_FAILED"
		| "TERMINAL_UNAVAILABLE"
		| "COMPENSATION_INCOMPLETE"
		| "TOO_LATE_TO_CANCEL";
	class: "precondition" | "conflict" | "transient" | "permanent";
	retryable: boolean;
	message: string;
	cleanup: "not-needed" | "complete" | "pending" | "incomplete";
	workspaceId?: string;
};
```

Only unauthenticated, malformed, or unaccepted `begin/get/act` calls reject
without an operation. Do not expose raw Drizzle, Git, or filesystem errors to
the renderer; map them once inside the Provisioning Implementation and retain
the original error only in host logs without request payloads.

## Rollout and rollback

- M1 and M2 are additive. An older binary ignores new SQLite tables/columns, so
  reverting code does not require a down migration.
- Keep compatibility host procedures until M3 and automation are deployed.
- New desktop clients require the new host capability and never dual-write.
- The bundled local host must match the desktop version. Unsupported remote
  host versions show upgrade-required.
- Do not drop Electron local-db identity tables during this plan. A rollback of
  presentation code therefore does not require reconstructing a local schema.
- After Catalog commit, rollback never means deleting user work. Operational
  retry/repair is the only allowed recovery.

## Dirty-worktree collision gate

This repository currently contains substantial user edits. Before implementing
each milestone, run:

```bash
git status --short
git diff --name-only
```

The current changes overlap at least these planned M3/M4 files:

```text
apps/desktop/src/renderer/routes/_authenticated/layout.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx
apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts
packages/local-db/src/schema/schema.ts
```

Preserve those edits. Implement M0–M2 in host-service first because their main
files are currently clean. Before M3, re-read the overlapping diffs and layer
the new projection/Launch Coordinator onto the user's current v1-shell work;
never restore deleted v1 migration or settings files.

## Appendix A — renderer identity-read migration inventory

Replace the Electron Workspace identity queries in these files during M3b:

```text
apps/desktop/src/renderer/commandPalette/ui/RecentlyViewed/RecentlyViewedFrame.tsx
apps/desktop/src/renderer/commandPalette/ui/WorkspaceList/WorkspaceListFrame.tsx
apps/desktop/src/renderer/components/NewWorkspaceModal/components/PromptGroup/PromptGroup.tsx
apps/desktop/src/renderer/hooks/useWorkspaceShortcuts.ts
apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/NavigationControls/components/HistoryDropdown/HistoryDropdown.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/TopBar.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/project/$projectId/components/ExternalWorktreesBanner/ExternalWorktreesBanner.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx
apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/useCommandWatcher.ts
apps/desktop/src/renderer/routes/_authenticated/settings/project/$projectId/components/ProjectSettings/ProjectSettings.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/projects/components/ProjectsSettingsSidebar/ProjectsSettingsSidebar.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/projects/page.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/terminal/components/TerminalSettings/components/PresetsSection/PresetsSection.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/terminal/components/TerminalSettings/components/PresetsSection/components/PresetEditorDialog/PresetEditorDialog.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/hooks/usePortsData.ts
apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/WorkspaceListItem.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components/WorkspaceHoverCard/WorkspaceHoverCard.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/NewWorkspaceButton.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ChangesContent/ChangesContent.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/EmptyTabView.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/GroupStrip/GroupStrip.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/HostServiceTerminalPane.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/RichInput/TerminalRichInput.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/V1PanesPresetBar.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/V1PanesWorkspace.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/V1PanesWorkspaceRunButton.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/useV1PanesWorkspace.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/useV1PanesWorkspacePaneLayout.ts
apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/PresetsBar/PresetsBar.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/ChangesView.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/FilesView.tsx
apps/desktop/src/renderer/screens/main/components/WorkspaceView/RightSidebar/index.tsx
apps/desktop/src/renderer/screens/main/components/WorkspacesListView/WorkspacesListView.tsx
```

For each file, classify the old query before replacing it:

- identity/list/order → Workspace Catalog projection;
- Git/PR information → host Git/PullRequest Interface;
- sidebar/pane/order/unread → renderer presentation collections;
- setup/run configuration → pure resolver supplied with Catalog paths.

Do not create a giant legacy-shaped host response merely to minimize call-site
edits; that would make the new Interface as shallow as the old Implementation.

## Completion definition

This ExecPlan is complete only when:

- every creation/adoption caller crosses Workspace Provisioning;
- every identity reader crosses Workspace Catalog or its renderer projection;
- all compatibility Adapters and Electron identity writers are deleted;
- host restart recovery and fixed-ID terminal adoption pass;
- offline and CDP lifecycle evidence is recorded;
- full lint, typecheck, and tests pass with no warnings.

The deletion test must hold: removing Workspace Provisioning would force Git
materialization, idempotency, recovery, Catalog commit, terminal coordination,
and compensation back into every caller. That Depth is the intended Leverage;
the single host Implementation is the intended Locality.
