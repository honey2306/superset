# Tasks inside the normal conversation

Updated: 2026-09-19. This implements conversation-native Task admission, bounded
same-session goal continuation and explicit requirement coverage. It extends the
existing Pi-first Task runtime; it does not replace Pi's tool loop or add a fixed
secondary evaluator model.

## User journey

In an idle conversation using a **registered ACP runtime**, the normal composer
contains a compact **Chat / Task (对话 / 任务)** dropdown. Discuss an approach in Chat, switch to Task, and send the goal
in the same input. The Host adopts that exact session, workspace, model and native
conversation history. It does not create another chat window or copy a truncated
summary into a new Agent. Existing chat messages remain visible.

Ordinary messages do not automatically become Tasks and do not wait for a new Task
lookup before being sent. Server-side ownership checks prevent an old view from
bypassing a Task that another view just admitted. Failed admission preserves the
normal composer's draft/attachments; request IDs prevent duplicate creation after
an ambiguous acknowledgement.

An inline card shows goal, current state/phase, continuation count, candidate
coverage and actual checks. Pause/cancel/accept controls sit in that conversation.
During execution, the same composer submits guidance; its compact guidance-kind
menu distinguishes ordinary guidance from additional requirements/restrictions. Those use the existing revisioned guidance
mechanism. Sending in a paused task resumes it after recording the guidance. No
second task-only chat composer is mounted.

After completion/cancellation, **Return to chat** releases ownership without
removing messages or Task history. Sending an ordinary message after a terminal
Task also releases it first. Another Task can subsequently use the same Session;
only one unreleased TaskRun owns the session at a time. A stale report from an old
Run cannot complete the current one. Merely hiding/closing the conversation view
is detach, not stop.

The independent `/agent-tasks` page remains a cross-conversation overview/history
and advanced creation surface, not the mandatory entrance. Its **Open conversation**
link targets the Run's actual workspace/session. Advanced standalone Task creation
continues to support its existing explicit Git delivery selection.

### Current adoption boundaries

Conversation adoption uses the same `ACP_AGENT_HARNESS_BY_AGENT_ID` catalog as
ordinary ACP launch: Claude, Codex, Pi, MyFlicker and DeepSeek currently registered.
Only root sessions may be adopted, not delegated or discussion participants. Wait for the current native turn, pending permissions,
queued input and managed child work to finish before changing ownership. It never
interrupts an active conversation simply to create a Task. Claim/release occurs at
the daemon's session boundary and is checked against persisted Host ownership.

The current conversation entry inherits project verification settings, uses Auto
strategy, and defaults to **edits + verification**. It does not implicitly grant
Git publication based on natural language. In-place adoption does not retrofit the
Pi native Git write tracker that is installed at creation of explicitly publishing
standalone sessions, so this entry does not offer automatic Git delivery yet. It
also does not add deployment or model/provider switching.

Initial images and image guidance are preserved as actual content blocks, including
pause-before-first-dispatch. Unsupported block types are rejected rather than
silently discarded. Admission/individual guidance is bounded at 12 MiB JSON; each
image at 8 MiB base64 text, and accumulated guidance images at 32 MiB. Use file
references for larger material. Remote providers still determine whether a selected
model actually supports images; this feature does not promise otherwise.

## Bounded goal continuation

The old rule immediately blocked a normally finished Agent turn lacking
`report_task_result`. The new policy distinguishes normal early stop from real
errors, permission waits, cancellation and unknown dispatch state.

- A confirmed normal turn with no current result gets a focused continuation in
  the same session. If already done, it should report instead of repeating work;
  if genuinely blocked, it must explain the prerequisite rather than blindly retry.
- `outcome: continue` and a concrete remaining action, or a reported unfinished
  requirement, continue the existing goal. A plan alone need not stop the task.
- A ready result missing requirement assessments receives at most one focused
  follow-up to assess/finish that goal using existing observations.
- Valid coverage on the first small-task result adds no extra evaluator, planning,
  review or summary model call.

Default `maxContinuations` is 4 per Run, distinct from `maxRepairs` for failing Host
checks. Missing-report recovery is capped at 2; coverage-only recovery at 1; three
identical remaining-work reports on unchanged inputs stop as no progress. The
existing time budget, desired pause/cancel state and requirements revision always
win. These counters persist through Host restarts and do not authorize more time,
a new model or wider delivery permissions. The limit is an execution bound, not a
promise that the model will solve arbitrary tasks within that number of turns.

Requests whose outcome is unknown are still reconciled first, not replayed under
the excuse of goal continuation. Native errors, cancelled/dead sessions, waiting
permissions and explicitly reported real blockers do not trigger this loop.

## Requirement coverage and what it proves

`get_task` exposes requirement IDs: the full user goal, explicit acceptance text
when supplied, and each added constraint. `report_task_result.criteria` assesses
each as `satisfied`, `unfinished` or `unverified`, gives an honest rationale, and
may reference existing checks as `task:N` or `project:ID`.

The Host rejects unknown/duplicate IDs and unknown check references. Automatic
acceptance requires all current requirements assessed satisfied, plus at least
one relevant selected/executed acceptance check reference for each requirement.
Actual required checks still run, must pass, and must correspond to unchanged
inputs and current requirements. A reference to an existing but unselected check
is not proof it ran. Missing assessments, explicitly unverified behavior, or
uncovered requirements remain **Awaiting review**, even when a static check passed.

**This is not complete independent semantic verification.** The rationale and
mapping from a requirement to a check are still Agent claims. A weak test or an
incorrect assertion that a test covers the full goal can still miss a defect.
The Host verifies recorded execution and consistency, not the truth of every
natural-language statement. UI labels Agent-reported coverage separately from
Host check records; user acceptance stays attributed to the user. No success claim
should say an unrun browser scenario was verified just because typecheck passed.

The verification Skill may improve reproduction/coverage methods on demand, but
is not loaded as a mandatory phase and cannot approve checks or change Task status.
Pi's internal automatic retry/compaction loop remains the sole native Agent loop;
this Task continuation only acts at a confirmed outer-turn boundary.

## Implementation boundaries and compatibility

`tasks/task-conversation.ts` handles admission and release. `tasks/task-goal-policy.ts`
holds bounded continuation and structural coverage decisions. `TaskRunner` uses
those at existing execution/verification boundaries; concrete check execution and
Git delivery remain injected capabilities. No new workflow registry or supervisor
model was added.

`AcpSessionRuntime.setTaskMode` is a Host/daemon control operation, not an Agent tool
to grant itself ownership. Root sessions expose `get_task` and `report_task_result`
so a later adoption does not need to restart the SDK/MCP connection. Calling these
outside an enabled Task does not create one. Managed role restrictions are enforced
at invocation even if the root session was originally shown broader tool metadata.

Host prompt records retain full actual Agent input for recovery, while Timeline
user-message chunks use a concise Host-generated projection of the goal or
continuation. Internal Task policy is not rendered as a long repeated user message.
The actual model still receives its required instructions and original history.

Migration `0030_task_conversation_goal.sql` adds conversation ownership/history,
continuation counters and attachment fields. No older Task/Session data is deleted.
Daemons advertise `managedTaskVersion: 4`; older active daemons are not force-killed.
A busy old daemon may require its existing sessions to finish before normal upgrade
and in-place Task admission become available. Development watch may rebuild the
app; production data is not manually migrated by this work.

## Reproducible validation

```sh
bun run --cwd packages/host-service test --timeout 30000 \
  src/tasks/task-goal-policy.test.ts src/tasks/task-conversation.test.ts \
  src/tasks/task-conversation.e2e.test.ts

# Actual normal AcpSessionPane/composer + HTTP Host/ACP/Pi/MCP and local Git checks.
# Inference is deterministic loopback, and title generation is disabled in this fixture.
SUPERSET_TASK_CHAT_SMOKE=1 bun run --cwd apps/desktop scripts/task-runtime-smoke/run.ts
```

The API/daemon integration starts an ordinary discussion containing a unique
context marker, adopts its session as a Task, intentionally ends the first task
turn at a plan, continues, verifies a real file, then returns to ordinary chat.
The UI smoke drives actual pointer/keyboard input in the normal composer, checks
inline state, hides/remounts it and reloads after returning to chat. Platform
catalog/IPC hooks are isolated fixtures; Task/Agent APIs, native SDK, files and
checks are real. This is not a real external-model or installed-app upgrade test.


## Implementation verification (2026-09-19)

- Related Host/Task/conversation/Goal/Skills/ACP/Git regressions: **287 passed,
  0 failed, 24 files** (complete rerun, 131.11 seconds).
- Session Protocol full suite: **127 passed, 0 failed, 13 files**.
- Conversation card/mode, existing Task results and Skill preview: **13 passed,
  0 failed, 3 files**. Total **427**, without double-counting focused reruns.
- Host, shared, session-protocol and Desktop TypeScript checks, Host declarations,
  scoped source lint/Git-policy gates and git diff --check passed.

Final actual normal-chat Electron functional report:
`apps/desktop/.cache/task-ui-smoke-1789830930677/report.json`.
It records one Task, the same session, four conversation turns, one autonomous
continuation, a real passing command, original context retained, return to ordinary
chat, reload without duplicate work, and zero renderer/network errors. Inference
uses the isolated loopback model; the unrelated CLI title generator is disabled
in the final fixture. This is not a current external-provider or mfcli live test.

**Visual limitation:** three stages have captured screenshots. The final
post-reload CDP screenshot repeatedly timed out despite readable DOM/history and
correct session state. The successful functional-only run explicitly used
`SUPERSET_TASK_CHAT_CAPTURE_RELOAD=0`, and the report says
`visualEvidenceComplete: false`. Do not interpret it as complete visual evidence
for reload or silently omit this caveat. The default smoke still requests that
screenshot; the override exists to separate functional observations from a capture
failure, not to turn a missing screenshot into a pass.

```sh
SUPERSET_TASK_CHAT_SMOKE=1 SUPERSET_TASK_CHAT_CAPTURE_RELOAD=0 \
  bun run --cwd apps/desktop scripts/task-runtime-smoke/run.ts
```

The isolated Electron/HTTP Host/daemon/model service were closed. The test HTTP
teardown checks the actual closed listener and all accepted sockets because Bun's
node:http callback can remain pending after upgraded WebSocket shutdown. Earlier
timeout-owned detached fixture daemons were retired by exact process identity.
Development hot reload also left orphaned local-dev Host processes consuming CPU;
after confirming no unfinished development Tasks, only those retired Host PIDs
were stopped. Current app/Host, ACP/PTY daemons, and /Applications/Superset.app were
not targeted. No Superset code was committed or pushed. Schema generation and
temporary-database migration tests are not manual production migration.


## ACP catalog and compact UI correction (2026-09-19)

Task contracts, conversation admission, manager claim/release and UI engine labels
now share the existing ACP catalog instead of duplicating a Pi/mfcli allowlist.
A new runtime must still be implemented/registered by the application; this does
not claim arbitrary external CLI commands are automatically ACP-compatible.
The selected runtime retains its own login, model and native session. Native
steering follows `canSteer`; unsupported steering uses the existing same-session
follow-up queue. An ambiguous native acknowledgement never starts a duplicate
queued operation. Actual MCP availability/provider behavior can still block a Task;
the Host does not infer success from a turn ending without an actual result.

The task indicator is now a compact strip with status, title and small pause/cancel
controls; detailed requirements/checks are collapsed and height-bounded. The mode
picker is in the status bar below the existing composer frame, not a second toolbar or input. Task
history remains available after returning to normal chat. The overview uses the
same status visuals, emphasizes returning to chat, and moves technical execution
settings/metrics and destructive actions into secondary disclosures/menus.

Daemon capability version 5 distinguishes the generalized admission from older
Pi/mfcli-only processes. A busy old daemon is not forcibly terminated to upgrade.
Automatic Git still requires Pi-native mutation provenance; broad Task support
must not be confused with symmetric publish capabilities. No new DB migration,
required Task phase, automatic skill load or extra model call was introduced here.


## 本轮验证：ACP 目录与界面（2026-09-19）

Host/Task/Skills/ACP/Git 定向回归 304 项、协议 127 项、共享目录 4 项、UI 10 项通过，共 445 项。Host/Shared/Desktop 类型检查与 Host 声明生成通过；本轮 33 个变更源文件定向 lint 和仓库 Git 规则、git diff --check 通过。没有新增数据库迁移或真实模型请求。

实际本机 local-dev 页面（localhost:3005 /agent-tasks、CDP 9226）记录同一 1510×963 视口的修复前后证据：Task 容器从 632px 变为 1246px，匹配 1246px 父容器，无空详情栏。截图与 DOM 数值在 `.cache/task-agents-ui/`。

隔离真实 Electron 聊天流程：原输入框菜单切任务→同会话执行→一次有限续跑→实际检查→返回聊天→刷新保持身份。任务条实测 66.5px，只有一个输入框，模式选择器在框内，无横向溢出。报告 `apps/desktop/.cache/task-ui-smoke-1789832590208/report.json`，前三阶段截图已捕获；刷新后截图受既有 CDP 截图问题影响未捕获，刷新验证是 DOM/历史/会话身份验证，不声称完整视觉证据。

隔离真实 Electron 总览流程：空列表、完整 Agent 选择器、配置/指导、失败修复、真实 Shell 检查、真实 Git 提交/临时本地远端推送、筛选无匹配、清除筛选、600px 窄窗选择/返回、恢复宽窗、刷新均通过。宽页 1320/1320px，窄页 600/600px，无溢出；空列表与无匹配状态没有列表或详情占位。报告 `apps/desktop/.cache/task-ui-smoke-1789832630951/report.json`，另有空状态和窄窗口截图共 6 张。

五种 ACP 的接管/所有权/取消/释放测试使用真实进程和协议、确定性假适配器；上述 Electron 使用真实 Pi SDK 与本地模拟推理。这些结果不等于五家真实模型提供商已逐一验收。真实本机测试没有创建业务任务、没有改用户记忆/全局技能，也没有推送本项目源码。独立测试进程已关闭，开发应用保留运行。


### Mode selector placement correction

The Chat / Task picker and in-task guidance type now live in the existing bottom
status bar, beside model/thinking/context/Git information, not inside the composer.
The footer remains visible while a Task owns the session. Its model and thinking
values stay read-only until the task releases the conversation, preventing the new
placement from bypassing frozen execution configuration. Menus open upward. The
editor has no extra Task toolbar or duplicated mode entry.

Validation of this placement change: matched running local-dev at port 3005,
same workspace route/viewport before and after. The picker moved from inside the
composer to the bottom status bar; the footer remains 30 px tall and there is one
picker and one editor. Evidence: `.cache/task-mode-statusbar/before.{json,png}` and
`after.{json,png}`. Ten related UI tests and Desktop typecheck passed. Isolated
Electron chat → Task → same-session continuation → release → ordinary chat also
passed, including 600 px footer layout and read-only model identity during Task
ownership. Report: `apps/desktop/.cache/task-ui-smoke-1789833542392/report.json`.
That execution uses a local simulated model; post-reload screenshot remains outside
its visual evidence, while DOM/history/session checks pass. No Host runtime or
Task execution policy changed in this UI placement correction.
