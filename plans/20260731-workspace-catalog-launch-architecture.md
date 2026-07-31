# Architecture: host-owned Workspace Catalog and Launch

Status: accepted direction. Executable companion:
`20260731-workspace-catalog-launch-execplan.md`.

This design is the first foundation step for the v1/v2 terminal migration. It
removes the split Workspace identity that currently exists between Electron
local-db, host-service, renderer caches, routes, and boot migration code.

It builds on the locked decision in
`20260703-offline-first-workspace-table.md`: host-service owns Workspaces and
`host.db` is authoritative.

## Outcome

There is one deep host-side Workspace authority:

```text
UI entry points
    |
    v
Workspace Launch Coordinator        renderer; presentation only
    |
    v
Workspace Provisioning Interface    host command seam
    |-- durable operation journal
    |-- Git/filesystem materialization
    |-- Workspace Catalog commit
    `-- initial-session request ----> Terminal Runtime Interface
    |
    v
Workspace Catalog Interface         host query/event seam
    |
    v
host.db                              sole authority
```

The v1 shell may remain as presentation during migration. It must consume the
same canonical Workspace IDs and Terminal session IDs; it must not retain a v1
Workspace authority.

## Alternatives considered

### A. Minimal Workspace Catalog

Expose `launch`, `snapshot`, and `changes` on one compact Interface. This has a
small surface and good Depth, but a single RPC hides the real duration and crash
boundaries of clone, worktree creation, setup, and terminal startup. Recovery
would either leak back into the renderer or become an undocumented side channel.

### B. Caller-first Workspace Launch

Return an immediate candidate Workspace ID plus a completion promise. This is
convenient for existing UI callers, but gives the renderer too much knowledge of
optimistic identity, retries, pane initialization, and failure recovery. The
Interface is shallow because a caller still needs to understand the workflow.

### C. Durable Workspace Provisioning Operation

The caller submits intent and observes a persisted operation. The host owns the
saga, commit point, retries, and compensation. This is the most honest model for
Git + filesystem + SQLite + PTY work, but it requires an operation journal and a
resume worker.

### Decision

Use C for commands, paired with A's small Catalog query Interface. Keep a thin
renderer Launch Coordinator from B, but do not give it workflow ownership.

This produces three cohesive Modules with strong Locality:

- Workspace Catalog owns canonical Project and Workspace records.
- Workspace Provisioning owns creation/adoption workflow and recovery.
- Workspace Launch Coordinator owns presentation and navigation only.

Terminal Runtime stays a separate deep Module. Provisioning uses its Interface
to ensure initial sessions; it does not absorb terminal lifecycle policy.

## Public Interfaces

Names are illustrative TypeScript, not transport-specific contracts.

```ts
type WorkspaceSource =
	| { kind: "main" }
	| {
			kind: "branch";
			name: { kind: "explicit"; value: string } | { kind: "generated"; prompt?: string };
			from: { kind: "default" } | { kind: "ref"; value: string };
	  }
	| { kind: "worktree"; path: string; expectedBranch?: string }
	| { kind: "pull-request"; provider: "github"; number: number };

type ProjectTarget =
	| { kind: "existing"; projectId: string }
	| {
			kind: "setup-existing";
			projectId: string;
			origin: { repoUrl?: string; name?: string };
			mode:
				| { kind: "clone"; parentDirectory: string }
				| { kind: "import"; path: string };
	  }
	| { kind: "import"; path: string; git: "require" | "initialize-with-consent" }
	| { kind: "clone"; url: string; parentDirectory: string; name?: string }
	| { kind: "empty"; parentDirectory: string; name: string }
	| { kind: "template"; url: string; parentDirectory: string; name: string }
	| { kind: "temporary"; singletonKey: "default" };

interface ProvisionWorkspaceRequest {
	idempotencyKey: string;
	project: ProjectTarget;
	source: WorkspaceSource;
	display?: { name?: string; taskId?: string };
	existing?: {
		workspace: "reuse" | "fail";
		worktree: "adopt" | "fail";
	};
	initialSessions?: InitialSessionIntent[];
}

interface WorkspaceProvisioning {
	begin(request: ProvisionWorkspaceRequest): Promise<{ operationId: string }>;
	get(operationId: string): Promise<WorkspaceOperation>;
	watch(input: {
		operationId: string;
		afterRevision?: number;
	}): AsyncIterable<WorkspaceOperation>;
	retry(operationId: string): Promise<WorkspaceOperation>;
	cancel(operationId: string): Promise<WorkspaceOperation>;
}

interface WorkspaceCatalog {
	get(workspaceId: string): Promise<Workspace | null>;
	list(query?: WorkspaceCatalogQuery): Promise<WorkspaceCatalogSnapshot>;
	changes(afterRevision?: number): AsyncIterable<WorkspaceCatalogChange>;
}
```

`WorkspaceOperation.stage` may be shown as progress, but callers must never use
stage names to orchestrate the next step. Only `state`, `result`,
`requiredAction`, and typed failure fields are contractual.

The first implementation should use tRPC Adapters for both Interfaces. Tests use
an in-memory Adapter at the remote seam, while SQLite, Git, and filesystem
behavior use real temporary stand-ins because those local dependencies are
substitutable and contain the important failure semantics.

## Identity rules

- The target host generates canonical IDs for new Projects and Workspaces.
- Cross-host setup preserves the existing canonical Project ID. A privileged
  cutover Adapter may also preserve a legacy ID; normal launch callers cannot.
- The renderer generates an idempotency key, not a provisional Workspace ID.
- Adoption or reuse may return an existing canonical Workspace ID.
- Pending UI is keyed by operation ID. Navigation changes to the canonical
  Workspace ID only after the Catalog commit.
- Compatibility Adapters may preserve an ID only while old callers are still
  supported. Normal launch callers cannot choose canonical IDs.

This deliberately replaces the current `useWorkspaceCreates` assumption that
an optimistic renderer ID is already the canonical Workspace ID.

## Invariants

1. `host.db` is the only authority for Project, Workspace, operation,
   idempotency, and ownership records.
2. One Project has exactly one main Workspace.
3. A canonical worktree path belongs to at most one Workspace.
4. The same idempotency key plus the same canonical request returns the same
   operation; a different request returns `IDEMPOTENCY_CONFLICT`.
5. Success means the canonical Workspace exists, its filesystem location is
   usable, and Terminal Runtime can resolve it without renderer registration,
   path mapping, boot migration, or a feature flag.
6. Existing user directories from import, adopt, and temporary flows are never
   removed by compensation.
7. Events are emitted after the relevant `host.db` commit and carry a monotonic
   revision. A client can recover from a dropped subscription with snapshot plus
   `afterRevision`.
8. Renderer cache, pane layout, failed-create rows, and routes are rebuildable
   projections. None may repair or redefine canonical identity.
9. A terminal session ID is journaled before creation is attempted. Retry uses
   ensure/adopt semantics and cannot open duplicate sessions.
10. Cloud connectivity is not required for local Workspace creation, adoption,
    rename, deletion, or terminal launch.

## Commit point and ordering

Provisioning is a durable saga, not a fake distributed transaction.

1. Validate and canonicalize the request.
2. Atomically claim the idempotency key.
3. Acquire a leased lock for the canonical project/source identity.
4. Resolve Git root, refs, PR metadata, paths, and conflicts without mutating.
5. Journal planned IDs, paths, session IDs, and artifact ownership.
6. Materialize or adopt the repository/worktree.
7. Read back actual Git root, branch, and HEAD; renderer hints are not trusted.
8. Commit Project/Main Workspace/target Workspace to `host.db` and advance the
   operation journal. This is the Catalog commit point.
9. Run idempotent initialization and ask Terminal Runtime to ensure requested
   initial sessions.
10. Mark the operation succeeded and emit Catalog and operation events.

For a new Project, Project and main Workspace are committed atomically before an
optional branch or pull-request Workspace. Terminal sessions cannot be created
until their Workspace foreign identity exists.

## Failure and recovery

Before the Catalog commit point, compensation removes only artifacts explicitly
recorded as owned by this operation. It may remove a newly cloned directory or a
new worktree. It must not remove imported/adopted/temporary directories or user
content.

After the Catalog commit point, failure never deletes the Workspace or rolls
back user files. The operation becomes retryable and returns the committed
Workspace with a warning or failure describing the unfinished initialization.
Retry resumes from the last checkpoint.

Cancel is accepted only before the Catalog commit point. Afterwards it returns
`TOO_LATE_TO_CANCEL`; this avoids a state labelled cancelled while a canonical
Workspace still exists.

Host startup resumes `queued`, `running`, and `compensating` operations from the
journal. Renderer closures, promises, and Zustand state are never recovery
mechanisms.

Representative typed failures:

```ts
type WorkspaceFailureCode =
	| "IDEMPOTENCY_CONFLICT"
	| "INVALID_SOURCE"
	| "PROJECT_NOT_FOUND"
	| "NOT_A_GIT_REPOSITORY"
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
```

Accepted business failures are persisted on the operation. Only invalid
transport/auth/schema calls reject without an operation record.

## Seam placement

The Provisioning Implementation hides branch naming, Git conflict handling,
main Workspace creation, worktree races, Catalog transactions, operation
journaling, setup resolution, Terminal Runtime coordination, and compensation.
Those are implementation details, not renderer choices.

Internal Adapters:

- `CatalogRepository`: host SQLite tables and transactions.
- `OperationJournal`: durable operation, checkpoint, lock, and ownership rows.
- `Git`: local Git operations.
- `ProjectMaterializer`: import, clone, empty, and temporary strategies.
- `PullRequestResolver`: GitHub metadata and refs.
- `TerminalRuntime`: ensure/adopt initial sessions and readiness.
- `Filesystem` and `CredentialProvider`: host capabilities.

Do not expose a renderer plugin registry or arbitrary pipeline steps. New source
variants are explicit additions to the tagged union and host Implementation.

## Migration plan

### M0: characterization and evidence gate

- Freeze integration tests for current host create/adopt/main/PR behavior.
- Add failure tests for SQLite insert rollback, concurrent branch creation,
  existing worktree adoption, host restart, and terminal startup failure.
- Record which live UI entry points still call Electron local-db or mutate
  renderer authority.

No behavior changes in this milestone.

### M1: extract the host Modules without changing behavior

- Move logic currently concentrated in the host workspace tRPC router behind
  `WorkspaceCatalog` and `WorkspaceProvisioning` implementations.
- Keep the existing tRPC procedures as compatibility Adapters.
- Centralize identity, main-Workspace, path, and conflict invariants.
- Reuse existing branch naming utilities in
  `packages/shared/src/workspace-launch`; do not duplicate them.

### M2: add durable operation semantics

- Add the operation journal, checkpoints, artifact ownership, leased locks, and
  resume worker.
- Make begin/retry idempotent across renderer and host restarts.
- Integrate Terminal Runtime through ensure/adopt session semantics.
- Add snapshot/revision recovery for Catalog and operation events.

### M3: cut the renderer to one launch path

- Replace `useWorkspaceCreates` with a thin Workspace Launch Coordinator.
- Move optimistic UI from provisional Workspace rows to operation projections.
- Route create, main, existing-worktree, import, PR, and temporary flows through
  Workspace Provisioning.
- Write pane layout only from the canonical result; pane state remains a
  presentation projection.
- Make the v1 shell consume the same Workspace Catalog and Terminal Runtime
  Interfaces.

### M4: identity cutover and deletion

- Produce a collision report; never silently merge ambiguous rows.
- Recover still-relevant on-disk worktrees through the normal explicit adopt
  flow. Do not restore an automatic v1 boot migration.
- Remove Electron local-db Workspace writes, boot registration/migration,
  path-to-ID repair maps, and feature-flag routing from the normal path.
- Delete privileged compatibility ID input with the old host procedures.

### M5: lifecycle verification

Verify each journey end-to-end with the same evidence before and after cutover:

- main Workspace open;
- new branch Workspace;
- existing worktree adoption;
- repository import;
- pull-request Workspace;
- temporary Workspace;
- offline create/rename/delete/open;
- renderer crash during materialization;
- host crash before and after the Catalog commit point;
- retry after terminal startup failure;
- close/reopen with no duplicate PTY sessions.

The acceptance gate is not merely a passing mutation. The visible route,
canonical Workspace ID, filesystem state, Catalog row, pane projection, and
Terminal session ownership must agree.

## Non-goals

- Redesigning Terminal Runtime lifecycle; that is the next architecture item.
- Making Workspace Catalog own tab/pane layout or unread/activity state.
- Preserving both v1 and v2 authorities behind a permanent compatibility flag.
- Adding cloud as a required coordinator for local Workspace operations.
- Claiming atomicity across Git, filesystem, SQLite, and PTY processes.

## Deletion test

This design adds real Leverage only if the old paths disappear. At completion,
deleting Workspace Provisioning should force every creation/adoption caller to
reimplement idempotency, Git recovery, Catalog commit, and compensation. If
those responsibilities remain duplicated in callers, the Module is shallow and
the migration is incomplete.
