# Workspace Catalog Launch — 交付与验证记录

本记录随已交付的 ExecPlan 一同归档，跟踪
`20260731-workspace-catalog-launch-execplan.md` 的实际交付和验证结果。
其中的历史增量记录保留用于审计；非阻塞的展示层后续工作不属于本计划的
Completion definition。

## 当前总状态（2026-08-04 复核）

- **归档结论：功能交付、专项自动化、lifecycle evidence 和正式全量测试均已完成。**
  根目录正式测试命令是 `bun run test`；它通过 Turbo 为每个 package 加载各自的
  preload。裸 `bun test` 会绕过这层 monorepo 配置，不属于本计划的验收命令。
  当前没有已知的功能或 authority-cleanup 缺口。
- **M0 / M1 / M3 / M3b：已完成。**
- **M2：本轮已完成计划中的 checkpoint/resume 收尾。** Production source handlers 已脱离 `appRouter.createCaller`，直接执行 branch/worktree/PR 的 Git materialization；main-workspace、prune、resolve、worktree add/adopt、configure、materialize 和 Catalog commit 均有可恢复 receipt，已完成的 receipt 只有在外部状态（包括 canonical worktree path）仍有效时才复用。artifact 也在创建后即时登记，保留 compensation 能力。
- **M4：计划中的 authority cleanup 已完成。** 创建入口已切到 Provisioning，旧 renderer 创建/兼容 hook、`failedWorkspaceCreates`、Electron workspace 创建/初始化/身份 writer（包括无调用的 `projects.close` 和 db helper 删除器），以及 Host 的 `workspaces.create`、`workspaceCreation.adopt`、`project.create/setup` 兼容 procedures 均已删除；正常导入、clone、template、已有项目 setup、PR checkout、主 workspace 打开和拖放导入统一走 `workspace-launch`/Catalog。剩余 `workspaceCreation` 仅保留只读的 branch/worktree/issue/PR 搜索，v1 pane/presentation collection 和已存在 workspace 的 queued agent pane 仍是明确的展示兼容边界。
- **M5：12 条 journey 已完成验证；#5 按边界拆分记录。** 在精确 worktree 的同一 local-dev Electron 实例上，主 workspace、branch/adoption、文件夹导入（含 Git-init 确认和取消）、PR/fork、temporary、offline/restart/retry/close-reopen 以及 clone 均有真实 UI/CDP 证据；empty/template 仍以 Host Provisioning 证据记录，未把它们冒充成同一次 combined UI journey。详见 [`20260802-workspace-catalog-cdp-evidence.md`](20260802-workspace-catalog-cdp-evidence.md)。
- **真实应用 smoke 已通过（非 CDP）。** 已直接检查本 worktree 正在运行的 `Superset (local-dev)`：启动不再依赖本地或远端登录，`/sign-in` 只重定向到 `/workspace`；本地单用户 session / active organization 使用稳定 hook 结果。修复 `useWorkspaceLaunch` 每次 selector 都生成新 snapshot 导致的 React 19 无限渲染后，真实窗口已进入 `/#/workspace/<workspaceId>`，并显示 terminal、agent presets、Run workspace 与 terminal input。
- 当前验证：`bun run test` **12/12 Turbo tasks successful**（Desktop **2215 pass / 0 fail**）、repo-wide `bun run typecheck` **22/22**、root `bun run lint` **通过且无 warning**；本轮受影响 renderer 回归 **24 pass / 0 fail**，Catalog/sidebar/workspace-launch 关键回归 **43 pass / 0 fail**；full host-service integration **246 pass / 0 fail / 14 skip / 8 todo**。正式测试命令和 bare `bun test` 的差异详见 [`20260802-workspace-catalog-cdp-evidence.md`](20260802-workspace-catalog-cdp-evidence.md)。
- M4 静态复核：`ensureTemporaryWorkspace/getTemporaryWorkspace` 无引用；renderer/automation 无 `workspaces.create` / `project.create` / `project.setup` / `workspaceCreation.adopt` 生产调用；旧 Electron workspace identity query grep 已清零，Terminal 仅保留 renderer presentation marker 与 Catalog 兼容兜底；Electron 无生产调用的旧 branch-search procedures 已删除。

## ✅ 已完成（第一轮 M0–M3b 基础交付）

### M0 — Characterization & collision audit
- `packages/host-service/src/workspace-catalog/collision-report.ts`
- `packages/host-service/test/integration/workspace-catalog-identity.integration.test.ts`
- `packages/host-service/test/integration/workspace-provisioning-characterization.integration.test.ts`

### M1 — Workspace Catalog module
- Drizzle migration `0012_smiling_patriot.sql`
- `packages/host-service/src/workspace-catalog/*.ts`（WorkspaceCatalog / canonicalizeHostPath / runCatalogIdentityBackfill）
- 9 条 Catalog 单测
- store 接线：`local-workspace-store` / `local-project-store` 走 Catalog；
  `persistLocalProject`；ensureMainWorkspaceStrict；project delete；backfills 追加 Catalog 参数
- `workspaces.create` 从 tolerant 改为 `ensureMainWorkspaceStrict`
- `catalog:changed` 事件类型 + broadcast
- tRPC: `workspaceCatalog.snapshot` / `.changes`

### M2 — Workspace Provisioning MVP
- Drizzle migration `0013_shallow_tigra.sql`
- `packages/host-service/src/workspace-provisioning/*.ts`（types、canonical-request SHA-256 幂等 hash + redaction、operation-journal、WorkspaceProvisioning 类、production-runner 通过 createCaller 委托）
- `workspace-operation:changed` 事件类型 + broadcast
- tRPC: `workspaceProvisioning.begin/get/list/act`
- 7 条集成测试

### M3 — Client Launch Coordinator
- `packages/workspace-client/src/lib/workspaceProvisioning.ts`：ProvisioningAdapter 接口、createTrpcProvisioningAdapter、createInMemoryProvisioningAdapter、extractAttachableLaunches
- workspace-client eventBus 支持 `catalog:changed` 与 `workspace-operation:changed`
- `apps/desktop/src/renderer/stores/workspace-launch/` zustand store + hook + selectors
- 12 条 workspace-client + store 单测

### M3b — WorkspaceCatalogProvider（骨架）
- `apps/desktop/src/renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/` 4 文件
- 4 条 projection reducer 单测

## ✅ 已完成（第二轮补齐）

### M3 收尾
- `packages/shared/src/host-version.ts`: `MIN_HOST_SERVICE_VERSION` 提到 `1.16.0` 且改写 changelog 描述 Workspace Catalog + Provisioning 是**新客户端唯一支持路径**，remote host 老版本进入 upgrade-required
- `packages/trpc/src/router/automation/dispatch.ts`：`createWorkspaceOnHost` 由 `workspaces.create` 切到 `workspaceProvisioning.begin`；idempotencyKey `automation-run:<runId>:workspace`；MVP saga 同步返回终态，预留 resume poll 位置

### M2 深度补齐
- `workspace-provisioning/leases.ts`：`deriveNaturalLockKeys`（`project-path` / `project:<id>:main|branch|worktree|pr` / `temporary`）、`acquireLeases`（单事务批量 insert 到 `workspace_operation_locks`，PK 冲突 → RESOURCE_BUSY，超期租约回收）、`releaseOperationLocks`
- `WorkspaceProvisioning.begin` 增加：saga 前 acquireLeases（RESOURCE_BUSY 折入 operation 行）；succeeded 前把 `RunnerArtifact[]` 写入 `workspace_operation_artifacts`；无论成功/失败最终释放本 op 的 lease
- `runProvisioningResumeSweep`：app.ts 启动时先跑；扫描 `queued`/`running` 孤儿 operation → 释放 lock，patch 成 `failed(retryable=true, code=COMPENSATION_INCOMPLETE)`，清空 launch payload，广播事件
- `createTestHost` 加 `dbPath` / `removeDbOnDispose` / `stop()`，允许 restart 场景复用 sqlite 文件
- 新 `workspace-provisioning-recovery.integration.test.ts` 3 条测试：restart 后 orphan 被扫成 failed(retryable)、pre-claim 后 begin 返回 RESOURCE_BUSY、成功 op 结束后 locks 表为空

### M3b 挂载
- `WorkspaceCatalogProvider.tsx` 从骨架升级为真实数据源：先订阅 `catalog:changed` 记录 high-water mark、拉 `workspaceCatalog.snapshot` 原子安装、追赶到 high-water mark、每 30s healing snapshot refetch（revision 前进才覆盖）
- 挂到 `_authenticated/layout.tsx` 在 `LocalHostServiceProvider` 内、`HostWorkspacesProvider` 外

## ✅ 已完成（第三轮：M2 深度收官）

### Terminal Runtime Adapter
- 新 `workspace-provisioning/terminal-runtime-adapter.ts`：
  - `createProductionTerminalRuntime` 包 `createTerminalSessionInternal`，caller-supplied `terminalId` 让 retry adopt daemon session
  - `createInMemoryTerminalRuntime` 支持 `failNext(err)` 脚本化测试
- `OperationJournal` 加 `ensureTerminalId(operationId, intentKey)` + `markStepComplete`：借 `workspace_operation_steps` 表持久化 `<opId, intent>` → terminalId 映射；retry 稳定
- `WorkspaceProvisioning.begin` 增加 Catalog 提交后 `stage='starting-runtime'` 阶段：
  * required 失败 → failed(retryable, TERMINAL_UNAVAILABLE)，workspaceId 仍暴露供 renderer 导航
  * best-effort 失败 → warnings 累积，操作照常 succeeded
  * 每次 spawn 记 `kind='terminal'` `ownership='created'` artifact

### 真 compensation
- 新 `workspace-provisioning/compensation.ts` `compensateOperation`：
  * `ownership='adopted'` 一律 skip
  * `ownership='created'` 对 `repo-dir` 走 rmSync、`worktree` 走 `git worktree remove --force` + fallback，`branch` 走 `git branch -D` **但只在 journaled head 与当前一致时删**（防误删 diverged 用户工作）
  * `terminal` 归为 not-needed（post-commit 用户可见，禁止清）
- begin 失败分支：pre-commit（未 catalogCommittedAt）自动调 `compensateOperation`；结果 state 决定 `cleanupState=complete|incomplete`

### 6 项额外 recovery / terminal / compensation 测试
- 新 `workspace-provisioning-terminal.integration.test.ts` 6 场景全绿：required/best-effort terminal 失败语义、`ensureTerminalId` 幂等、ownership-based compensation、pre/post-commit 分岔

## ✅ 已完成（第四轮：renderer selector 底座 + 首批消费点迁移）

### Catalog selector hooks
- `providers/WorkspaceCatalogProvider/selectors.ts`：`useCatalogWorkspaces` / `useCatalogWorkspacesByProject` / `useCatalogWorkspace` / `useCatalogProject` / `useCatalogProjects` / `useCatalogWorkspaceNeighbours`
- `providers/WorkspaceCatalogProvider/selectors.test.tsx`：happy-dom + `@testing-library/react/pure`；6 描述 / 10 断言全绿覆盖 null-id、identity、by-project 过滤、prev/next 边界
- `LocalHostServiceProvider` 加 non-throwing `useMaybeLocalHostService`，让 Catalog provider 可无 host context 渲染，方便 renderer 单测注入 `initialState`

### 首批 renderer 消费点迁移
- `EmptyTabView.tsx`：`electronTrpc.workspaces.get` → `useCatalogWorkspace`。附带把 host schema `type: "main" | "worktree"` 映射为 v1 shell 语义 `"branch" | "worktree"`（DeleteWorkspaceDialog 只认后者），代码内注释说明两个术语指同一件事
- 追加迁移 identity-only 消费点：新建 workspace 按钮、tab/group/preset 上下文、右侧栏、Files/Changes 视图、终端 pane/rich input、V1 panes 和 Ports 面板均从 Catalog 读取 `projectId/worktreePath`；项目设置页的 v1 分支改读 Catalog projects；保留各自的 Git、filesystem、terminal 和 presentation state 查询。

### 第五轮：workspaceCatalog tRPC 边界测试
- 新 `workspace-catalog-trpc.integration.test.ts` 5 场景：empty snapshot / legacy backfill / changes 严格 forward-only / pagination hasMore / deleteProject cascade 顺序

## ✅ 已完成（第六轮：M2 sources 抽取 + resume 精细化 + automation contract）

### sources/ 目录抽取
- `sources/{existing-project,project-materializers,setup-existing,temporary,index,types}.ts`：把 production-runner 的 118 行大 switch 拆成 execplan §File map 列出的 handler 集合；每个 handler 独占一个文件，便于未来把 git 算法从 `caller.workspaces.*` 委托改成模块内直接调用
- `production-runner.ts` 缩减为 dispatch + type wiring；行为无变化

### resume sweep 精细化
- `runProvisioningResumeSweep` 区分 pre-commit vs post-commit 孤儿：
  - **pre-commit**（catalog_committed_at IS NULL）：`COMPENSATION_INCOMPLETE` + cleanupState=pending，识别为需要补偿的 saga
  - **post-commit**（catalog_committed_at IS NOT NULL）：`TERMINAL_UNAVAILABLE` + cleanupState=not-needed，保留 workspaceId 让 renderer 立即可导航；user-visible terminals 禁止被 compensation 清除
- 新 recovery 测试覆盖 post-commit 分支

### automation dispatch contract test
- 新 `dispatch-provisioning.contract.test.ts` 3 场景：拦截 `relayMutation` 出去的 fetch 请求验证:
  1. succeeded operation → 返回 { workspaceId, branchName }
  2. failed operation → 抛 failure message
  3. 请求路径是 `workspaceProvisioning.begin` 而非 legacy `workspaces.create`
- `createWorkspaceOnHost` 导出（附注释仅测试用），保持 dispatchAutomation 私有

108 pass / 1 skip / 0 fail 跨 17 文件；typecheck 干净；lint exit 0。

### Appendix A 剩余大部分暂不动的原因
逐个抽样 5 个高价值候选后发现 Appendix A 里"能纯 identity 迁移"的比例低于最初估计。**保留不动**的调用点分类：
- **useWorkspaceShortcuts / WorkspaceListFrame**：读的是 `workspaces.getAllGrouped`，除 identity 外还带 v1 shell 的 section/group order + project color 展示元数据；catalog projection 不该承担这些。Projects settings 的 v1 project-only 分支已改读 Catalog projects。
- **`workspace/$workspaceId/page.tsx`**：identity、path 和 previous/next 已改读 Catalog；初始化/重试 UI 现在读取 Launch Coordinator 的 Provisioning operation projection
- **WorkspaceListItem**：读的是 `getAheadBehind`，不是 identity；Ports、Changes、Files 的 workspace identity 已改读 Catalog，Git/port 查询仍保留
- **V1PanesWorkspace 系列**：identity-only 的 `projectId/worktreePath` 已迁移，剩余 pane runtime、布局和 init 展示态仍深度绑定 v1 shell
- **Terminal**：仍需要 v1 `isUnnamed` 展示语义，但已从 Electron workspace identity query 改为 renderer presentation collection；新 Provisioning 行写入 marker，旧 v1 行用 Catalog 的 `name === branch` 兼容兜底。PresetSection 已改为 `projects.getRecents` 提供近期展示字段，并用 Catalog 项目 ID 做身份过滤。

这批的正确迁移路径是**先把 v1 shell 的展示元数据搬到 renderer collections**（execplan Appendix A 备注 "sidebar/pane/order/unread → renderer presentation collections"），才能拆开 identity 与 presentation。此步骤等 v1 shell 让位时再做。

## 非阻塞后续收敛（不属于本计划）

### M4 展示兼容边界（计划已完成；以下为后续收敛记录）
- execplan 列出的 6 个 Electron/renderer 文件当前状态：
  - **已删除**：`renderer/react-query/workspaces/useCreateWorkspace.ts`、`useCreateFromPr.ts`、`screens/main/components/WorkspaceInitEffects.tsx`、`stores/workspace-init.ts`。
    初始化/重试展示已迁到 `WorkspaceProvisioningOperationView`，queued agent pane launch 由 `AgentSessionLaunchEffects` + `agent-session-launch` store 承担。
  - **已删除**：`workspaces/procedures/create.ts`、`workspaces/utils/workspace-creation.ts`；Electron router 仍保留查询、Git 状态和 presentation/section 等非创建 procedures。
- 额外的旧提交 hook **已删除**：`renderer/stores/workspace-creates/useWorkspaceCreates.ts`；原 4 个调用入口统一使用 `workspace-launch/useWorkspaceProvisioningSubmission.ts`。
- `NewWorkspaceModal` 已改由 `workspace-launch/useWorkspaceCreateActions.ts` 直接提交 Provisioning，不再依赖已删除的两个旧 hook。
- Sidebar temporary workspace 已改由稳定 key `temporary-workspace:default` 提交 `{ project: { kind: "temporary" }, source: { kind: "main" } }`；Electron `projects.ensureTemporaryWorkspace/getTemporaryWorkspace` procedures 已删除。
- Electron `workspaces.init` / `onInitProgress` / `retryInit` / `getInitProgress` / `getSetupCommands` 及其旧 worktree initializer 已删除；删除流程仍保留通用 `workspaceInitManager` 以兼容已存在的进程内初始化任务。
- 剩余兼容依赖：
  - Provisioning submission 不再写入 optimistic workspace identity 或 workspace transaction；只在 host 返回 canonical Workspace ID 后写入 renderer-owned pane/presentation state。
  - renderer 的剩余 identity/presentation 读取集中在 project picker 的展示元数据、Terminal `isUnnamed` marker、sidebar/pane/order state 和 AgentSessionLaunchEffects 的 queued pane 兼容态；agent-session 文件写入、command watcher、workspace route 和初始化 operation UI 的 identity/state 读取已改走 Catalog/Provisioning。
  - `AgentSessionLaunchEffects` 仅承担已存在 Workspace 的 queued agent pane launch；Provisioning operation 状态负责 workspace 初始化、post-commit runtime failure 与 retry UI。
  - host Provisioning `sources/` 已直接执行 checkpointed Git/materializer；旧创建/adopt procedures 已删除，`workspaceCreation` 只保留搜索类只读 procedure。
- **后续非阻塞收敛**：在 v1 shell 完全让位后，再移除 renderer-owned pane/order/unread 展示兼容写入和已存在 workspace 的 queued agent pane 兼容态；这不再阻塞 Provisioning/Catalog 主链路。
- **本轮出口**：已在 `.superset/setup.local.sh` 启动的精确 local-dev 实例上完成真实 UI/CDP 验证。

### M4 增量收尾（本轮）
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/project/$projectId/page.tsx` 已切到 `useWorkspaceLaunch().begin(...)`，不再调用旧的 Electron `workspaces.create`。
- setup 保存成功后通过 `initialSessions` 请求 Provisioning 启动 setup terminal；跳过 setup 不会创建新的 setup intent。
- Catalog 已提交但 terminal 启动失败时，保留 `workspaceId` 并导航到已创建 workspace；只有未提交、没有 canonical ID 的失败才阻止导航。
- 本轮继续迁移了共享创建入口：`useWorkspaceCreates`、新 workspace modal、PR checkout、打开 main workspace，以及项目导入/clone/template/已有项目 setup/relocate；这些路径现在统一构造 `ProvisionWorkspaceRequest`，并保留 terminal/agent pane layout 写入。
- 新 workspace modal 已移除 `react-query/workspaces/useCreateWorkspace`、`useCreateFromPr` 两个旧 hook，改由 `workspace-launch/useWorkspaceCreateActions` 直接消费 Provisioning；`failedWorkspaceCreates` 本地失败身份存储也已删除，失败状态只来自 operation receipt。
- Dashboard workspace modal 的 branch picker、prompt submit、task batch 和 issue batch 4 个入口已移除 `useWorkspaceCreates` 依赖，改由 `workspace-launch/useWorkspaceProvisioningSubmission` 提交 Provisioning；纯 request translation 已拆到 `workspace-launch/request.ts`。
- v1 shell 的 identity-only 读取继续收敛：新增按钮、tab/group/preset、right sidebar、Files/Changes 以及 terminal host/rich-input 均改读 Catalog projection；仍依赖 Git/PR、pane/order、run definition 或 init 状态的点暂不强行迁移。
- workspace route loader 已删除；路由身份、工作目录和 previous/next 导航使用 Catalog projection，prompt/attachment 文件写入通过 host Catalog snapshot 解析 canonical worktree path。
- command watcher 的 workspace/project 工具视图使用 Catalog projection；agent-session adapter 不再调用 Electron `workspaces.get` 解析文件路径，改为 host Catalog snapshot。
- renderer 初始化桥已拆分：`workspace-init` store、`onInitProgress` 订阅和 `retryInit` UI 已删除；queued agent launch 独立存入 `agent-session-launch` store，由 `AgentSessionLaunchEffects` 消费。
- Electron `workspaces.init` router 与旧 `workspace-init` worktree materializer 已同步删除；`workspaceInitManager` 仅作为删除流程的通用运行时协调器保留。
- 项目创建路径新增 `beginProjectProvisioning` 适配层：Provisioning 成功后从 Catalog 读取 canonical `repoPath` 和 main workspace，避免再依赖旧的 project setup/create mutation。
- PR checkout 使用稳定的 `pr-workspace:<projectId>:<number>` idempotency key，重复点击不会创建第二个同一 PR workspace。
- 本轮主线程进一步收敛了 M4：pane-layout writer 与 request translation 均归属 `workspace-launch`；Provisioning submission 删除随机请求 ID 的 optimistic Catalog/cache 行和 workspace transaction 写入，并新增 request/pane layout 回归测试。仍不是 M4 的最终删除：v1 shell 兼容层、已存在 Workspace 的 queued agent pane 兼容态，以及 host/Electron compatibility procedures 仍需后续在 presentation/CDP 验证后移除；host `sources/` 的 Git materialization delegation 已在本轮移除。
- 本轮继续迁移 worktree reopen：New Workspace modal、Project settings 的 external worktree 和 WorkspacesListView 的 closed worktree reopen 均复用 `useWorkspaceCreate` → Provisioning；删除无生产调用的 `useHandleOpenedWorktree` / `bootstrap-open-worktree` 桥及其测试。随后删除 Electron `create` router 及其 `workspace-creation` helper，`openWorktree` / `openExternalWorktree` / `import*Worktrees` 等旧创建入口随之移除；只读的 external/worktree discovery queries 继续保留。
- Provisioning 失败页面的删除动作已改走 workspace owner host 的 `workspaceCleanup.destroy`，不再尝试用 Electron identity 删除一个仅存在于 Host Catalog 的 canonical workspace；强制删除仍复用同一 host cleanup path。
- branch/main workspace 的“隐藏”动作改写 renderer sidebar tombstone 并清理 host terminal session，不再删除 Electron identity row；缺少 Catalog project identity 时会明确提示失败。
- Terminal 自动命名、workspace rename 和 Git branch 同步均直接调用 owner Host `workspace.update`；host 不可用时记录警告并跳过写入，不再回退 Electron identity mutation。
- Provisioning 删除页和 workspace 删除对话框均按 workspace owner host 路由 `workspaceCleanup`；command watcher 的 `switch_workspace` 走 renderer route，`update_workspace` / `delete_workspace` 也直接调用 owner host。
- New Workspace modal 的 AI branch-name 请求直接调用本机 Host `workspaces.generateBranchName`；host 尚未可用时走既有 UI fallback，不再调用 Electron procedure。
- 本轮删除了无生产调用的 Electron workspace identity writers：`create`、`init`、`delete`、`generateBranchName` procedures，以及 renderer 的 `useCreate*`、`useCloseWorkspace`、`useDeleteWorkspace`、`useUpdateWorkspace` hooks；剩余 `deleteWorktree` 仅负责未纳入 canonical Catalog identity 的 closed external worktree 清理，`status` 中的 reorder/unread 和 section routes 仍属于 v1 presentation 层。
- Host 侧 `workspaces.create`、`workspaceCreation.adopt`、`project.create/setup` 已删除；`workspaceCreation` router 仅保留 branch/worktree/issue/PR 搜索类只读入口。
- 分支 picker、Project Settings 的 base-branch 列表、dashboard external-worktree banner 和批量导入均改用共享的 Host `workspaceCreation.searchBranches` 读取层；时间戳统一在 renderer 入口从 Unix 秒转换为毫秒，并保留 `hasWorkspace` 作为 adopt 过滤条件。Electron `getExternalWorktrees` procedure 已删除；`WorkspacesListView` 的 `getWorktreesByProject` 仍暂留给 closed-worktree 删除/展示语义。
- 本轮（2026-08-04）删除了无生产调用的 Electron branch-search procedures：`apps/desktop/src/lib/trpc/routers/projects/projects.ts` 中的 `getBranchesLocal`、`getBranches`、`searchBranches`、`refreshDefaultBranch` 已全部删除，随之移除未使用的 `refreshDefaultBranch` 导入与 `BRANCH_SEARCH_LIMIT` 常量；`workspaces/utils/git#refreshDefaultBranch` 仍被 `workspaces/procedures/git-status` 使用，保留。renderer 侧无任何调用点，删除通过 `bun run typecheck`（22/22）、`bun run lint`（无 warning）、targeted `useGitChangesStatus` / `workspace-launch` / `WorkspaceCatalogProvider` 回归（22 pass / 0 fail）验证。**注意**：出口 grep 结果保持全部零匹配。

### M2 checkpoint resume（本轮）
- `resume()` 现在区分 pre-commit 与 post-commit：post-commit retry 只恢复 setup/terminal runtime，不会再次执行 Git/materializer，也不会重复创建 Catalog Workspace。
- `workspace_operation_steps` 记录完整 launch receipt；已完成的 terminal step 在 retry/host restart 时直接复用 journaled launch，未完成 intent 才调用 Terminal Runtime。
- `act({ action: "retry" })` 在 request payload 可恢复时立即启动后台 resume；renderer 不再需要再次调用 `begin` 才能继续 operation。
- 新回归覆盖：retry 不重新调用 runner、terminal ID 不变、重复 launch receipt 去重；专项 recovery/terminal 测试 11 项全绿。

### M2 Git/materialization checkpoint 收尾（2026-08-02）
- `sources/` 现在通过直接的 Git materializer 执行 existing branch/worktree/PR；不再把生产路径委托给 `appRouter.createCaller` 的旧 Git procedure。
- 每个外部可见边界都写入 operation step receipt，并在重启/重试时做外部状态校验后 reconcile：ensure main、prune、branch/PR resolve、worktree add/adopt、configure、materialize 与 Catalog commit 均覆盖。
- artifact 在创建后立即登记到 operation journal，pre-commit 失败仍可按 ownership 做 compensation；worktree receipt 额外校验 project、branch 和 canonical path，避免复用错误工作树。
- clone/import/empty/template 也统一使用 checkpointed source path。回归覆盖了 runner 在 Catalog commit 前抛错时的 step receipts、artifact ownership 和不重复调用旧 mutation。

### Appendix A 40+ renderer identity 读位置
- 执行方式：每个位置从 `electronTrpc.workspaces.get*` / `useLiveQuery` over `v2Workspaces` collection 切到 `useWorkspaceCatalog()` / `useWorkspaceProjection()`
- 出口门（M4 收尾时验证）：
  ```
  rg -n 'workspaces\.create|project\.create|project\.setup|workspaceCreation\.adopt' apps/desktop/src/renderer packages/trpc/src
  rg -n 'localDb\.(insert|update|delete)\((projects|workspaces|worktrees)\)' apps/desktop/src/lib/trpc/routers
  rg -n 'electronTrpc(Client)?\.workspaces\.(get|getAll|getAllGrouped|getPreviousWorkspace|getNextWorkspace)(\.useQuery|\.query)' apps/desktop/src/renderer
  ```
  本轮复核结果：旧 Electron workspace identity query 已无匹配；Terminal 的 `isUnnamed`
  仅来自 renderer presentation collection，并对旧 v1 行保留 Catalog 兼容兜底；renderer
  `workspace-init` bridge 已无匹配。PresetsSection
  已切到 `projects.getRecents` 展示数据并用 Catalog 项目 ID 过滤；workspace route、command watcher、
  agent-session path resolver 以及其余 identity-only 消费点已无匹配。

### M2 深度剩余
- 计划中的 pre-commit Git step-level resume 与 sources 内嵌 Git 算法已在本轮完成；后续只需在真实生产流量和更多故障注入场景下继续扩展覆盖，不再是本计划的未处理项。

### M2 checkpoint 增量
- `production-runner` 为每个 `ProjectTarget × WorkspaceSource` 写入 `source:<project.kind>:<source.kind>` step receipt；handler 返回成功后持久化 `projectId/workspaceId/disposition/artifacts`，host 在 Catalog commit journal 尚未落盘前重启时可直接复用该结果，不再重复 materializer。
- Git source handler 内部进一步写入 main/prune/resolve/worktree/configure/materialize 等边界 receipt；每个 receipt 都带外部状态 validator，状态失效时才重新执行对应步骤。temporary source 继续记录 `prepare-repository` 与 `catalog`，clone/import/empty/template 也使用同一机制。

### M5 端到端证据
- 2026-08-04 在精确 worktree `/Users/wufan/Code/superset` 启动 `Superset (local-dev)`，renderer 为 `http://localhost:3005/`，CDP 为 `127.0.0.1:19325`；未使用 `/Applications/Superset.app`。
- 12 项矩阵已执行：1、2、3、4、6、7、8、9、10、11、12 为完整 CDP/UI pass；5 的 clone 有完整 UI pass，empty/template 以同一 Host Provisioning contract 的 supplemental 证据记录。
- 完整 operation、workspace、Catalog、terminal session、PID、截图路径和限制说明见 [`20260802-workspace-catalog-cdp-evidence.md`](20260802-workspace-catalog-cdp-evidence.md)。
- 这一矩阵不把 host API 验证、DOM 合成点击或不同安装包的结果当作正式 CDP 证据。

## 参考
- Architecture: `20260731-workspace-catalog-launch-architecture.md`
- ExecPlan: `20260731-workspace-catalog-launch-execplan.md`
