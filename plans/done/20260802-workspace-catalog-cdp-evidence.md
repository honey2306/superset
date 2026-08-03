# Workspace Catalog M2/M5 evidence — 2026-08-04

This record is for the exact local development instance used for the acceptance
checks. It deliberately separates browser/CDP evidence from host-service-only
checks; a host API result is not represented as a CDP user journey.

## Test target

- Worktree: `/Users/wufan/Code/superset`
- Commit at test start: `2401f5c58` (working tree was intentionally dirty)
- Renderer: `http://localhost:3005/`
- Renderer CDP: `127.0.0.1:19325`
- Active organization: `1887f807-99db-49c0-9568-fc085a2fd36a`
- Host endpoint: `http://127.0.0.1:48679` (local only)
- Host DB: `/Users/wufan/Code/superset/superset-dev-data/host/1887f807-99db-49c0-9568-fc085a2fd36a/host.db`
- Host build: `@superset/host-service` `1.16.1`; `health.check` returned `{ status: "ok" }`
- Cloud networking: unavailable in this single-user run; the host was still
  reachable locally and all local Catalog/Provisioning checks were executed.
- No auth token or host secret is recorded here.

The exact local-dev Electron process was restarted after a native modal blocked
the first host-stop attempt. The subsequent checks used the newly started
`Superset (local-dev)` process from this same worktree, with the same renderer
port and host data directory. The installed `/Applications/Superset.app` was
not used as evidence. The final folder-import checks used this same process
after the sidebar import entry was cut over from the legacy Electron `openNew`
path to `useFolderFirstImport` and Host Provisioning.

## M2 implementation and automated evidence

The production source handlers now execute Git materialization directly and
journal every externally visible boundary: main-workspace ensure, prune,
branch/PR resolution, worktree add/adoption, PR branch preparation, configure,
and Catalog commit. Completed receipts are reused only when their external
state—including the canonical worktree path—still validates. Created artifacts
are persisted immediately for compensation. Clone/import/empty/template
materializers use the same checkpointed path.

Targeted automated gates after the implementation changes:

- Provisioning integration/recovery/terminal: **21 pass / 0 fail**, 78 expects.
- Workspace cleanup unit/integration: **35 pass / 0 fail**, 109 expects.
- Renderer Catalog/sidebar/workspace-launch regressions: **43 pass / 0 fail**, 89
  expects; the affected import/modal/sidebar set adds **24 pass / 0 fail**.
- Full host-service integration: **246 pass / 0 fail**, 14 skipped, 8 todo,
  1045 expects, across 268 tests / 42 files. The lower count reflects the
  intentional deletion of legacy workspace-create/adopt/project-setup suites.
- Repo-wide `bun run typecheck`: **22/22 tasks successful**.
- Repo-wide `bun run lint:fix` completed, then `bun run lint`: passed with no
  warnings; `git diff --check`: passed.
- Repo-wide formal test command `bun run test` passed: **12/12 Turbo tasks
  successful**; the Desktop package completed **2215 pass / 0 fail** across
  226 files, and the other package test tasks also completed successfully.
  Bare `bun test` was intentionally not used as the monorepo gate because it
  bypasses Turbo and mixes package-specific preloads into one Bun process,
  producing cross-package fixture and timing failures.

## M5 journey matrix

`CDP` means real renderer input/navigation plus before/after screenshots. Host
operation IDs and Catalog rows were checked in SQLite after the UI action.

| # | Journey | Result | Evidence |
|---|---|---|---|
| 1 | Main Workspace | **CDP pass** | Main route entered and terminal/agent/run controls rendered; `/tmp/superset-cdp-evidence-20260802/01-main-after.png`. |
| 2 | New branch | **CDP pass** | Operation `f7e9ec32-3abb-4990-a917-d70954232227`, workspace `2e38e7dc-69a0-4166-a575-7a071fe6ed89`, succeeded revision 4; `/tmp/superset-cdp-evidence-20260802/02-new-branch-after-final.png`. |
| 3 | Existing worktree adoption | **CDP pass** | Real modal submission for `codex/terminal-fusion-smoke`; operation `7a109bb0-df8d-4c17-9463-4fac4544f4bf` returned `disposition: reused`, Catalog retained one branch row and opened workspace `76e00a43-105c-40c0-a8e5-2ee76f68a043`; `/tmp/superset-cdp-evidence-20260802/03-existing-adoption-before.png` and `03-existing-adoption-after.png`. |
| 4 | Folder import with/without Git-init consent | **CDP/UI pass** | Real macOS picker opened `/tmp/superset-cdp-m5-import-fixed-20260804`; confirmation was accepted and operation `d1f96c53-bb16-4ed5-8e79-216d50b53ff2` succeeded with project `82cce4e0-9c2a-4adb-934e-32a96ac53e82`, workspace `0c5d187f-c967-43a8-8593-880559721542`. A second picker run for `/tmp/superset-cdp-m5-import-cancel-fixed-20260804` was cancelled at the Git-init dialog; SQLite has no operation or project row for that path. Screenshots: `/tmp/superset-cdp-evidence-20260804-folder-after-success.png`, `/tmp/superset-cdp-evidence-20260804-folder-cancel-consent.png`. |
| 5 | Clone, empty, template Project | **Clone CDP pass; empty/template Host pass** | Real UI URL clone used `https://github.com/octocat/Hello-World.git` with project `cdp-m5-clone-20260804`; operation `47631df2-f102-42b2-814f-ccf4c9d97808`, project `e2b0bfa4-e813-4923-9bee-bf3f1369e33d`, workspace `2f1428ca-a0cb-49c2-891f-b9a0d8d6e4b8`, succeeded. Screenshots: `/tmp/superset-cdp-evidence-20260804-clone-before.png` and `/tmp/superset-cdp-evidence-20260804-clone-after.png`. Host-only empty/template operations remain `07cd622b-ab90-4f1d-9412-683e339caf02` and `a29865f2-9592-42e5-8c08-6f4747b15fde`; they are not presented as one combined UI journey. |
| 6 | PR checkout, including fork PR | **CDP/UI pass** | Real Host-backed PR picker searched and selected open PR `#10714 Add contribution note to README`; operation `70e99713-ee92-4734-bd4a-aa76981bb879` succeeded/reused for project `67930fe7-9251-4ba5-bf82-256faa0e29a0`, workspace `a1cbe433-7860-4482-98f3-5ccfcfdc96fe`. Catalog records branch `febinnwilson/feature-my-contribution`, upstream owner/repo `febinnwilson/Hello-World`, and fork semantics. Screenshots: `/tmp/superset-cdp-evidence-20260804-pr-picker-results.png`, `/tmp/superset-cdp-evidence-20260804-pr-selected-before-submit.png`, and `/tmp/superset-cdp-evidence-20260804-pr-after.png`. |
| 7 | Singleton temporary Workspace | **CDP pass** | Repeated real temporary-workspace action reused workspace `bc94686f-b041-4778-837b-5c1c8800b4f2`; `/tmp/superset-cdp-evidence-20260802/07-temporary-before.png` and `07-temporary-after.png`. |
| 8 | Offline create/rename/delete/open | **CDP pass** | Real rename/delete flow for workspace `88760de4-aa5f-4023-9f3d-ec0e045170f8`; deletion removed its Catalog row and canonical worktree, then navigated away from the stale route. `/tmp/superset-cdp-evidence-20260802/08-offline-rename-after.png` and `11-offline-delete-after-fixed-final.png`. |
| 9 | Renderer restart during materialization/terminal startup | **CDP pass** | Real branch submit followed by `Page.reload`; operation `62e4ed77-fd62-49d9-99bd-632abab36b9d` completed revision 4 and the row opened after reload; `/tmp/superset-cdp-evidence-20260802/09-renderer-reload-before-submit.png`, `09-renderer-reload-after-materialization.png`, and `09-renderer-reload-opened-workspace.png`. |
| 10 | Host restart before/after Catalog commit | **CDP pass** | Renderer-issued coordinator restart changed the local Host PID from `19511` to `30176`; health stayed OK, Catalog row remained, and a real renderer reload restored terminal input. `/tmp/superset-cdp-evidence-20260802/10-host-restart-after-reload.png`. |
| 11 | Terminal failure followed by retry | **CDP pass** | PTY daemon was deliberately frozen before real submit. Operation `a5b8ccb6-2c65-4979-82a1-f07e7a6fab88` visibly failed with `TERMINAL_UNAVAILABLE` at revision 4; real `重试` resumed it to succeeded revision 7. Setup terminal `c48ba901-14e8-4a75-8a35-171a8324e325` was reused, with no duplicate operation intent. `/tmp/superset-cdp-evidence-20260802/11-terminal-failure-visible.png` and `11-terminal-retry-after.png`. |
| 12 | Close/reopen without duplicate PTY | **CDP pass** | Real route switch `0d1ec8f6-37f2-4b79-817d-7bdad81b13c0 → 76e00a43-105c-40c0-a8e5-2ee76f68a043 → 0d1ec8f6-37f2-4b79-817d-7bdad81b13c0`; the same four `terminal_sessions` rows and three active sessions remained before/after. `/tmp/superset-cdp-evidence-20260802/12-close-reopen-same-before.png` and `12-close-reopen-same-after.png`. |

The only intentionally split acceptance boundary is #5's empty/template pair:
their Host Provisioning contracts are green, while this run did not claim that
they were exercised as one combined renderer journey. The native folder picker
and PR picker are now explicitly covered with Computer Use plus real Host
operation/Catalog evidence.
