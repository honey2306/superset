# Superset verification reference

Load this reference only when working on the Superset monorepo. Resolve the repository
root from the current working directory (for example, `git rev-parse --show-toplevel`);
commands below run at that root, not at the skill directory. Recheck scripts and
current project instructions before execution; this file is not an authorization.

## Choose the scope

- Task policy, state, checks, recovery or Git delivery: inspect the corresponding
  tests under `packages/host-service/src/tasks/`, then run only the affected files.
- Session protocol, event folding or history: run the relevant tests in
  `packages/session-protocol`; the full package suite is appropriate for shared
  protocol changes, not required for a copy-only Desktop change.
- Desktop Task result rendering: use the co-located tests under
  `apps/desktop/src/renderer/routes/_local/_dashboard/agent-tasks/`.
- Git delivery: use disposable repositories and local bare remotes. Never use the
  development repository or a real remote as a fixture for commit/push/rollback.

Use the package test script so its preload/environment is correct, for example:

```sh
bun run --cwd packages/host-service test src/tasks/task-runner.test.ts
bun run --cwd packages/host-service test src/tasks/delivery/git-delivery.test.ts
bun run --cwd packages/session-protocol test src/state.test.ts
bun run --cwd packages/host-service typecheck
bun run --cwd apps/desktop typecheck
```

These are choices, not a mandatory sequence. Host declaration generation is relevant
when exported router types changed; do not rebuild everything for a local assertion.
Check `apps/desktop/docs/TASK_RUNTIME.md` for current reproducible commands and limits.

## Know what an integration run proves

`src/tasks/task-transport.e2e.test.ts` in host-service uses actual HTTP, daemon, Pi SDK,
MCP and file/process boundaries with deterministic model inference. The isolated
Electron smoke in `apps/desktop/scripts/task-runtime-smoke/run.ts` drives actual Task
components but controls platform discovery and inference. Neither is automatically
proof of the installed app's bootstrap, migrations or a corporate mfcli provider.

The separate real-provider script `packages/host-service/scripts/verify-real-task.ts`
uses the currently configured provider and consumes real quota. Do not run it merely
because this skill was loaded; use it only within an explicitly requested real-model
validation scope. Do not copy credentials into source, logs, skill text or memory.

For a reported installed-app issue, follow `apps/desktop/AGENTS.md` and the actual
instance/route/authentication requirements. For isolated verification, label it as
isolated. Do not restart a busy user daemon or migrate their running database just
to make a test pass. No deployment test is implied by a successful Git push test.
