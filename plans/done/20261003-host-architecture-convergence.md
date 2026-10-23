# Host architecture convergence

## Outcome

Implement the four approved architecture changes while preserving local-only
ownership, current permission policies, existing user data and detached runtime
lifetimes. Existing uncommitted changes are part of the starting worktree.

## Workstreams

1. Extract Host application operations from transport routers. Agent launch,
   project materialization and workspace operations must be reusable by routes,
   scheduling and provisioning without importing the transport layer. Translate
   application failures to tRPC errors at the transport seam.
2. Give Task, Automation and Discussion executions a common Run contract and
   operational facade over their existing authoritative persistence. Preserve
   their different completion/acceptance policies and recovery behavior. Do not
   introduce a second database authority or automatically migrate user databases.
3. Introduce a versioned Superset conversation semantic contract at Host ingress.
   Preserve original ACP payloads and replay of historical journals. Keep provider
   recognition in a compatibility adapter, not desktop/mobile rendering.
4. Separate portable Host contracts from implementation and share client transport
   operations across Desktop, Web and CLI. Verify contract conformance and prevent
   client packages from importing server implementation types.

## Verification

- Preserve existing launch, permission, catalog/provisioning and Task tests.
- Exercise common Run identity, cancellation, results and reconstructed state.
- Compare live and legacy conversation replay, partial tool updates, questions,
  permissions, parent linkage and streaming text semantics.
- Typecheck the affected packages and clients; verify generated contracts against
  the real router. Check application/transport dependency direction.
- Run repository lint. Use isolated fixtures and deterministic adapters; no real
  provider quota, user database migration or installed-app restart is implied.

## Progress

- Baseline: existing Agent launch tests pass (12 tests). Working-tree diff saved
  under `.cache/architecture-refactor/` before implementation.

- Completed: application operations extracted for Agent launch, project management,
  workspace provisioning helpers, workspace cleanup and launch/location settings.
  Routers translate application errors at one transport boundary.
- Completed: Run contract and Host facade backed by Task/Automation/Discussion
  persistence, shared stop routes used by Desktop, durable discussion lookup and
  compatibility with retained older daemons. Policies and data schemas retained.
- Completed: versioned conversation events recorded at ingress; legacy replay,
  streaming heuristics, tool metadata and permission interpretation share the
  compatibility adapter. Raw diagnostics are retained.
- Completed: portable contracts for 299 procedures and shared Host SDK adopted by
  Desktop, Web, CLI and workspace-client; removed compiled declaration workaround.
- Final typechecks: host-service (including contract drift check), host-contract,
  host-client, session-protocol, workspace-client, CLI, Web and Desktop all pass.
- Regression evidence (scoped runs overlap; counts are not summed): application
  and cleanup 138 pass; common Run/API 13 pass; transport/settings/phone/automation
  87 pass; conversation HTTP 8 pass; Run/real Git cleanup 20 pass; protocol 132
  pass; SDK 5 pass; Desktop client/permissions 41 pass; Web outbox/permissions and
  workspace provider 12 pass; CLI 110 pass. The broader Task/runtime lane had 199
  passing tests and three missing-native-dependency import errors; all three
  affected files passed after restoring the already-locked DuckDB native package.
- `bun run lint:fix`, `bun run lint` and `git diff --check` pass. No production
  database or installed application was touched. Existing user edits are retained.
- Verification uses deterministic adapters, real child processes, HTTP/WebSocket
  transport and temporary SQLite/Git fixtures. Authenticated model-provider tests
  and manual Desktop/phone journeys were not run.

Reference: `packages/host-service/docs/architecture-boundaries.md`.
