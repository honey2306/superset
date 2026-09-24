# Managed Tasks — Pi-first execution, project checks, live guidance and Git delivery

Updated: 2026-09-19. Design: `plans/20260919-task-runtime-pi-first-design.md`.

Extension boundary: see `TASK_CAPABILITY_BOUNDARIES.md`. Further project-specific
methods belong in memory/skills and existing tools, not mandatory Runner phases.
A project-local `verify-behavior-change` skill now lives under `.agents/skills/`;
Pi's existing loader discovers its metadata and reads its body on demand. It does
not add deployment authorization, bypass acceptance, or install itself globally.

This documents phase A/B and the first phase C Git-delivery slice, not the entire roadmap.
Pi SDK remains the default; Task execution uses all registered ACP engines. Tasks default to
**edits and verification**. Pi tasks can explicitly opt into a local commit or a commit
and push to a selected existing branch. Deployment is not implemented.

## Skills and extension boundaries

The existing Agent Context Skills tab now manages global and project `.agents/skills`
packages with lazy metadata/detail retrieval, full-bundle copy, safe rename, reference
preview and revision conflicts. It does not add another required Task phase.
Checks and Git execution are injected through narrow capability interfaces, while
Task cancellation, requirements and acceptance remain in the core. See `SKILLS.md`
and `TASK_CAPABILITY_BOUNDARIES.md` for implemented scope and discovery limitations.

## Conversation-first Task entry

In an idle registered ACP chat, choose **Chat / Task** inside the existing composer and
send the goal. It reuses that session, model and history, shows progress/coverage
inline, and returns to ordinary chat after completion without a new window.
The Task page remains overview and advanced creation. Normally finished but
prematurely stopped turns now have bounded same-session continuation; explicit
coverage gaps do not become green merely because a static check passed.
See `TASK_CONVERSATION.md` for exact behavior, budgets and semantic limitations.

## Entry and normal use

Open **Agent Tasks / 自主任务** (`/agent-tasks`), choose a local project and existing
execution directory, describe the goal, and start. Project verification defaults
are inherited. Advanced options retain explicit model/engine, task-specific checks,
strategy, repair limit and time budget. The separate Delivery endpoint selector
defaults to edits/verification, independent of Direct/Standard/Deep strategy. Creating
a Task does not create a worktree or branch and does not discard existing edits.
Only an explicitly selected Git endpoint may create a commit after acceptance.

A Git working directory with an existing HEAD is required. Unsupported/oversized
input snapshots block before work starts rather than pretending a partial snapshot
is a complete verification. The existing ACP sessions feature enables execution;
read-only task history still works when it is disabled. Phone access is not added.

## Project verification profile

Use **Project verification settings / 项目验收配置** from the creation dialog.
A versioned profile stores project instructions and approved checks. Each check has
an ID, command, timeout and applicable project-relative path patterns. Empty patterns
mean the check applies to every task; patterns support `*`, `**`, and `?`.

**Discover package scripts / 发现项目脚本** reads a bounded `package.json` and suggests
existing test/typecheck/lint commands. It shows the underlying script and requires
explicit addition and saving. Discovery executes nothing. Inspect scripts and their
lifecycle hooks before approving them; a script name alone does not guarantee safety.

Saving uses optimistic revision checks. Task creation binds the profile revision
shown in the UI; a concurrent profile change requires refreshing the preview. Runs
retain an immutable profile snapshot, so changing project defaults does not silently
change an active task or its historical acceptance policy.

### Check selection and completion

Explicit task checks remain required. The Host selects project checks from actual
input changes relative to the task's initial dirty-worktree baseline. Unchanged,
pre-existing edits are not treated as new Task changes. Shared configuration changes
(package/lock/test configuration, scripts, etc.), uncertain inputs or deep strategy
expand coverage. The agent may add an already-approved check ID, never remove a
required check or invent an executable check through result reporting.

By default, a candidate result awaits user review. A user can approve project checks
as fully covering their applicable acceptance requirements and enable automatic
acceptance. A Task can override that setting with explicit review. Zero selected
checks never counts as a vacuous success.

Typecheck exit zero does not prove a functional bug is fixed. Appropriate original
reproductions, regression tests or runtime scenarios must be part of the approved
checks. Automatic semantic generation of complete acceptance criteria is not yet
implemented. Novel subjective requirements may still require human review.

Commands run in `/bin/bash -o pipefail -c`, with `CI=1`, closed stdin, a timeout and
an owned local process group. Records contain actual command, output (latest 64 KiB),
exit code, input fingerprint, requirements revision and selection reason. A failed
check is handed back to the same Agent session within the repair/time budget.
Checks must not publish, perform destructive setup or leave background services.
They are real Shell commands, not a security sandbox.

### Reuse and invalidation

Reuse is off unless a check is explicitly marked deterministic and locally reusable.
An eligible passed check can be reused only in the same Run with identical command,
check ID, input fingerprint and requirements revision. The reuse event references
the actual prior record; it does not fabricate a new execution or exit code.

New requirements invalidate old acceptance claims. Source/test/config/index changes
invalidate the relevant input identity; input-changing checks are marked stale, not
silently passed. The current fingerprint covers HEAD/branch, tracked/index changes
and non-ignored untracked files at boundaries. It is **not an immutable filesystem
snapshot**, does not lock external editors and does not fully attest ignored files,
external service state, credentials or arbitrary environment variables. Checks
involving those inputs should not opt into reuse without an appropriate guarantee.

## Strategy and speed

There is one Runner, not one pipeline per strategy. Explicit direct/standard/deep
preferences remain available. Auto begins with inexpensive rules and adapts using
actual changed paths and failed checks: localized work stays direct; broader scope
or a failure strengthens diagnosis; repeated failure/high-impact changes can expand
verification. The next repair prompt uses the updated strategy in the same session.
No additional classifier/planner/reviewer model call is introduced by this policy.

Three failures of the same check/exit condition on identical inputs stop automatic
retry as no progress. This does not override a smaller repair budget. A strategy
change cannot grant publishing permissions, switch providers or weaken acceptance.

Preparation, Agent execution/tools, verification, Git delivery and input-snapshot time are recorded.
Snapshot time is a subset included in phase durations, not additive to the phase
sum. Active phase totals settle at transitions. These figures are diagnostic timing,
not a benchmark claiming this implementation is faster than direct Pi.

Managed sessions continue to skip the legacy title-generation model call. They do
not create a separate planning/review session for a small task.

## Live guidance and changed requirements

The Task detail has a live guidance composer in both result and execution views
during coding/verification. Once accepted work enters Git delivery, use pause, cancel,
revoke, reconcile or delivery-only retry instead of mixing new code requirements
into the accepted commit.
Pi uses native steering when the active session confirms that capability. ACP
engines without that path use the existing command-ID-deduplicated Host follow-up
queue. The UI distinguishes native/bundled/queued delivery. An interface acceptance
acknowledgement is not proof that a model has already consumed a queued message.

Each instruction has a request ID, content hash and expected requirements revision.
Recording it immediately increments the revision and invalidates older candidates
and verification. A ready result from a previous revision cannot complete the task.
If a check is running, obsolete verification is interrupted and the same Agent
session continues with the new instruction; the user need not pause first.

**Guidance** is within existing goals and acceptance. **Additional requirement /
restriction** also changes the Run to user-review acceptance: prior approval that
old checks cover the goal is not silently reused for a newly expanded goal. Existing
checks still run. Adding a constraint also revokes previously granted automatic Git
delivery; the old authorization is not applied to an expanded goal. The current UI
supports additive requirements, not destructive
replacement of the original contract or automatic permission elevation.

Guidance before execution is included in the initial prompt. Guidance added to a
paused task stays pending until explicit resume. If sending loses its acknowledgement,
the delivery becomes unknown and is not blindly repeated after reconnection.
Explicit pause/continue can reconcile it through a new controlled turn carrying
persisted guidance. Cancelled tasks cannot be revived by delayed instructions.

## Controls, recovery and data

Pause/cancel persist intent before requesting a stop. `pausing`/`cancelling` remains
until the execution confirms quiescence. Local verification receives process-group
cancellation. Detached or remote descendants outside that group are not falsely
claimed to be stopped. Cancellation does not roll back edits or erase history.

Closing the page detaches its views. It does not cancel the task or permanently
close its Session. Raw mutable Session APIs cannot bypass Task control, while
permission/question responses remain available through the reused Timeline.

The Runner lives in the Embedded Host. Keep Desktop running for complete autonomous
progression. Host restart inspects/adopts an existing daemon execution instead of
blindly resending the goal. Interrupted verification can remain unknown and require
review instead of replaying a potentially side-effecting command. Work while the
machine sleeps or after Desktop fully exits is not guaranteed by this slice.

A real transport test found that completed-turn journal compaction rotates `epoch`
and resets sequence numbering. Completion now compares sequence only within a
matching epoch and still requires the current owned candidate and a completion time
for the submitted command. The old cross-epoch comparison could incorrectly leave
a completed task stuck in `recovering`.

Migrations are additive and generated by Drizzle:

- `0026_task_runtime.sql`: Task/Run/Check/Event.
- `0027_task_profiles_guidance.sql`: versioned profiles, guidance and policy/evidence fields.
- `0028_task_completion_epoch.sql`: submitted journal epoch.
- `0029_task_git_delivery.sql`: native file-edit observations, durable Git operations, accepted revision and delivery revocation.

They were applied only to disposable test databases during implementation. No live
Host database was manually migrated and no existing desktop session was restarted.
Adopt a rebuilt Renderer/Host/daemon using the normal development/build workflow and
normal backup practice. Type declaration generation does not update a running app.

New daemons advertise `managedTaskVersion: 4`. Busy older daemons are not killed to
start a managed task; normal sessions retain their existing behavior. Finish old
active sessions and retry with the updated build rather than force-stopping work.

One managed writer owns a canonical directory at a time. This is Host coordination,
not a filesystem sandbox or a ban on your manual windows. Managed orchestration
still does not launch parallel delegated writers in this slice. Workspace/project
removal checks Task records before cleanup and reserves against concurrent creation.
Finished/cancelled Task records can be explicitly removed, retaining code and
conversation history; tasks/checks/control records are removed only by that action.

## Explicit Git delivery

The creation dialog offers **edits/verification**, **local commit**, or **commit and
push**. Git selection is opt-in and independent of task complexity. Select the local
branch, commit message and, for push, one configured remote and existing remote branch.
The remote destination is displayed and pinned by a hash of its expanded push URL.
Natural-language requests do not silently enable publication when this selector is
left at the default. Model execution itself remains instructed not to publish; the
Host performs the granted delivery after acceptance.

Git delivery currently requires **Pi-native write/edit provenance**. Other ACP Task
execution, checks and guidance remain supported, but automatic Git for mfcli is not
claimed. Shell-only writes, deletes, unusual file modes, oversized observed files
and changes from external editors without a coherent observation chain require
manual Git rather than guessing ownership.

The Pi adapter captures before/after file identity synchronously at native tool
boundaries, not later in the asynchronous UI event queue. The daemon persists those
observations. For every newly changed path, delivery requires a chain from the
initial HEAD contents through observed edits to the exact candidate contents. Files
that already had staged/unstaged edits at task start cannot be selectively attributed
by this first version and block automatic committing of that file.

### Preserving existing work

A private index is built from the parent commit and contains only proven task paths.
The user's real staging index is held with an exclusive index lock and reconciled
atomically after the commit, preserving unrelated staged and unstaged changes. No
`git add .`, reset, stash, forced cleanup or branch switch is performed. Other Git
locks are not deleted; recorded identity distinguishes an owned lock from another
process's lock. Stat-cache-only index refreshes are recognized during recovery without
overwriting the index. Existing Git identity, hooks and signing policy are honored.

For **local commit**, unrelated pre-existing dirty work may be preserved but the
acceptance is explicitly a working-directory result, not proof that the isolated
commit can run without those other inputs.

For **automatic push**, this version deliberately requires a clean initial Git-visible
working tree. Otherwise verification could depend on pre-existing files omitted from
the task-only commit. The selected remote branch must exactly match the initial local
HEAD, so the operation cannot silently publish earlier unrelated local commits. No
force-push, remote-branch creation or automatic merge/rebase is supported. Git filters
that transform the checked bytes and observed ignored-file changes also block pushing
until an isolated exact-tree verification path is available.

These restrictions are particularly relevant when using multiple windows in one
directory. Internal leases coordinate managed tasks, not external tools. Concurrent
branch switches, unexpected hook modifications or unowned writes are reported and
block further delivery. This is not a filesystem or credential sandbox.

### Durable operations and failure handling

`task_operations` records a single commit intent and, when requested, a single push
intent per Run. It retains selected target, parent/tree identity, actual commit ID,
process ID, exit code and bounded output. Operation states are prepared, submitted,
confirmed, failed and unknown. Candidate success is not Task success until the selected
delivery endpoint is actually reached.

Normal `git commit` uses the private index, so existing hooks/signing remain active.
The actual commit's parent, tree and unique delivery marker are checked before it is
considered the planned result. If a hook changes the tree, a commit may already exist:
it is recorded as unknown, never automatically pushed or destructively rolled back.

Push uses a pinned commit OID and pinned target URL/ref without force. Confirmation
queries the destination. A lost reply is reconciled against Git rather than blindly
repeating the operation. Rejected hooks or a failed push can be retried through
**Retry delivery only** after resolving the cause; this does not rerun the Agent or
create a duplicate commit. Unknown state must be reconciled first. Unexpected history
changes may remain blocked and require manual inspection rather than guessed recovery.

Pause/cancel interrupts the owned Git process group and confirms the result before
releasing coordination. **Revoke future Git delivery** prevents subsequent publishing;
a commit or push already completed is retained. New guidance is not accepted during
delivery. Task history removal refuses unresolved operations. Recovery artifacts are
kept under the repository Git directory's `superset-task-delivery/<operation-id>/`;
this slice does not automatically prune those recovery files when task history is removed.

Git transport uses the existing Git credential helper or SSH configuration, not model
API credentials. Embedded-credential HTTP URLs, ambiguous multiple push URLs and custom
remote helpers are not supported. Tests in this batch pushed only to temporary local
bare repositories; no real project remote was modified.

## Verified paths and limits

Validation for Phase C includes the prior Host/Task/Pi/ACP and legacy behavior suite,
real local Git edge cases, protocol tests, result component rendering and an isolated
Electron interaction test. Final scoped results: **242 Host tests in 17 files, 127 session-protocol tests in
13 files, and 6 Task result component tests: 375 passing tests, 0 failures**. Host,
Shared, Session Protocol and Desktop type checks, Host declaration generation,
61 changed-source/config lint checks, Git-policy gates and `git diff --check` passed.
No mock result is labeled as external inference. These are scoped suites, not every
test in the monorepo.

The Electron Git-delivery smoke ran the real Task components with actual CDP
mouse/keyboard interactions, real HTTP Host, detached daemon, Pi SDK, MCP file evidence,
Shell checks, local commit and local bare-remote push. It created a project profile,
selected push in the actual UI, sent live guidance, observed failed check → repair →
passed check → confirmed commit/push, and reloaded without another Run. Model inference
was deterministic loopback SSE; platform discovery was isolated test wiring, not
installed-application bootstrap. Successful artifacts are under
`apps/desktop/.cache/task-ui-smoke-1789822294122/`. Renderer exception and network-failure
collections were empty. Owned Electron/Host/daemon/Vite processes were closed.

Separately, an explicit real-provider smoke uses the user's currently selected Pi
provider/model, with synthetic repositories and temporary private configuration only.
It tested a simple label edit, a regression bug with real assertions, and cancellation
from active execution. The two code tasks passed their actual checks and committed/
pushed to a local bare remote. **This real-model check consumes the configured provider's
quota**; no exact financial cost is inferred. The final real-provider report is
`packages/host-service/.cache/real-task-1789822572064/report.json`: label task 23,315 ms,
regression task 24,664 ms, and active-execution cancel confirmation 427 ms. These
are single synthetic observations including actual commit/push to a local remote,
not P95 statistics or a direct-Pi speed comparison. Its manual script is opt-in and is not
part of ordinary tests. Provider credentials are never logged, and temporary copies
and owned repositories/processes are removed. These small samples are not a general
performance benchmark or a live mfcli company-provider test.

Remaining roadmap: automatic full semantic acceptance, dedicated browser/runtime
acceptance orchestration, independent reviewers, parallel delegated Task writers,
chat-to-task conversion, full goal replacement, exact isolated verification for dirty
shared-tree publication, deployment, and an independent always-on Host. Existing
PR/Issue/Todo/Automation behavior is preserved. There is no claim that all project
tests or a packaged application startup/upgrade were verified.

Publishing scope remains orchestration control, not strong OS credential isolation.
An unrestricted Shell with production credentials or a user-installed Git hook could
have external effects outside this boundary. Deployment is not enabled here.

## Reproducible validation commands

From repository root:

```sh
bun run --cwd packages/host-service test src/tasks \
  src/runtime/acp-sessions/pi-sdk-acp.test.ts \
  src/runtime/acp-sessions/superset-tools.test.ts \
  src/runtime/acp-sessions/superset-mcp.test.ts \
  src/runtime/acp-sessions/persistence.test.ts \
  src/runtime/acp-sessions/daemon.test.ts \
  src/runtime/local-automations.destination.test.ts \
  src/trpc/router/local-tasks/local-tasks.test.ts \
  test/workspace-cleanup.test.ts \
  test/integration/workspace-cleanup.integration.test.ts \
  test/integration/acp-sessions.router.integration.test.ts
bun run --cwd packages/session-protocol test
bun run --cwd apps/desktop test \
  src/renderer/routes/_local/_dashboard/agent-tasks/components/TaskDetail/TaskDetail.test.tsx
bun run --cwd packages/host-service typecheck
bun run --cwd packages/shared typecheck
bun run --cwd packages/session-protocol typecheck
bun run --cwd packages/host-service build:types
bun run --cwd apps/desktop typecheck
bun run --cwd apps/desktop scripts/task-runtime-smoke/run.ts
```

The smoke command launches and closes only its own isolated hidden Electron window;
it does not attach to an arbitrary existing CDP target or alter the installed app.


### Phase C manual validations

```sh
# Real Electron interaction; model inference is still deterministic and local.
SUPERSET_TASK_SMOKE_DELIVERY=1 bun run --cwd apps/desktop scripts/task-runtime-smoke/run.ts

# Explicitly spends the currently configured Pi provider's quota; isolated test data only.
SUPERSET_TASK_REAL_MODEL=1 bun run --cwd packages/host-service scripts/verify-real-task.ts
```

The real-provider script deliberately uses only the configured default model from
local Pi models/settings. It does not silently switch providers or run credential
commands. OAuth-only configurations and dynamically executable credential sources
need a different explicit integration; they are not guessed or copied automatically.


## Overview layout correction (2026-09-19)

The `/agent-tasks` route root now explicitly grows to the dashboard flex-row width.
An empty Task collection renders one centered conversation-first state, never two
reserved empty columns. A populated view has a compact list and flexible detail;
filtering to no results hides both columns. At widths below 760 CSS px, selection
opens a full-width detail with a back control rather than shrinking both panes.
Labels and the advanced Agent selector come from the common ACP catalog. Actual
Git publication permissions are unchanged.

Before/after evidence from the user's running local-dev renderer at
`http://localhost:3005/#/agent-tasks` (CDP 9226): viewport 1510×963, dashboard content
width 1246. Before, Task content width was 632 with 614 unused px to its right;
after it is 1246, exactly matching the parent, with no empty list/detail columns.
JSON and screenshots: `.cache/task-agents-ui/before.{json,png}` and
`.cache/task-agents-ui/after.{json,png}` at repository root. This directly reproduces
the reported layout, not merely a standalone component's width.


## 本轮验证：ACP 目录与界面（2026-09-19）

Host/Task/Skills/ACP/Git 定向回归 304 项、协议 127 项、共享目录 4 项、UI 10 项通过，共 445 项。Host/Shared/Desktop 类型检查与 Host 声明生成通过；本轮 33 个变更源文件定向 lint 和仓库 Git 规则、git diff --check 通过。没有新增数据库迁移或真实模型请求。

实际本机 local-dev 页面（localhost:3005 /agent-tasks、CDP 9226）记录同一 1510×963 视口的修复前后证据：Task 容器从 632px 变为 1246px，匹配 1246px 父容器，无空详情栏。截图与 DOM 数值在 `.cache/task-agents-ui/`。

隔离真实 Electron 聊天流程：原输入框菜单切任务→同会话执行→一次有限续跑→实际检查→返回聊天→刷新保持身份。任务条实测 66.5px，只有一个输入框，模式选择器在框内，无横向溢出。报告 `apps/desktop/.cache/task-ui-smoke-1789832590208/report.json`，前三阶段截图已捕获；刷新后截图受既有 CDP 截图问题影响未捕获，刷新验证是 DOM/历史/会话身份验证，不声称完整视觉证据。

隔离真实 Electron 总览流程：空列表、完整 Agent 选择器、配置/指导、失败修复、真实 Shell 检查、真实 Git 提交/临时本地远端推送、筛选无匹配、清除筛选、600px 窄窗选择/返回、恢复宽窗、刷新均通过。宽页 1320/1320px，窄页 600/600px，无溢出；空列表与无匹配状态没有列表或详情占位。报告 `apps/desktop/.cache/task-ui-smoke-1789832630951/report.json`，另有空状态和窄窗口截图共 6 张。

五种 ACP 的接管/所有权/取消/释放测试使用真实进程和协议、确定性假适配器；上述 Electron 使用真实 Pi SDK 与本地模拟推理。这些结果不等于五家真实模型提供商已逐一验收。真实本机测试没有创建业务任务、没有改用户记忆/全局技能，也没有推送本项目源码。独立测试进程已关闭，开发应用保留运行。
