# Workspace Catalog Launch — 已完成里程碑与未完成清单

跟踪 `plans/20260731-workspace-catalog-launch-execplan.md` 的实际交付进度。
每个已完成里程碑在下面简要列出其产物；未完成的部分给出精确范围便于后续
接手。

## ✅ 已完成（第一轮 M0–M5 收尾）

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
- **useWorkspaceShortcuts / WorkspaceListFrame / ProjectsSettingsSidebar / ProjectsSettingsPage**：读的是 `workspaces.getAllGrouped`，除 identity 外还带 v1 shell 的 section/group order + project color 展示元数据；catalog projection 不该承担这些
- **`workspace/$workspaceId/page.tsx`**：同时消费 nested `worktree.gitStatus`（v1 shell 特有），迁移会导致 dual-read
- **WorkspaceListItem / usePortsData / ChangesView / FilesView**：读的是 `getAheadBehind` / `getExternalWorktrees` / git 状态，不是 identity
- **V1PanesWorkspace 系列**：v1 shell 展示态深度绑定

这批的正确迁移路径是**先把 v1 shell 的展示元数据搬到 renderer collections**（execplan Appendix A 备注 "sidebar/pane/order/unread → renderer presentation collections"），才能拆开 identity 与 presentation。此步骤等 v1 shell 让位时再做。

## ⚠️ 未完成（需后续 PR，规模较大）

### M4 完整删除（**不可在 host-service 侧独立完成**）
- execplan 列出的 6 个 Electron/renderer 文件（`useCreateWorkspace` / `useCreateFromPr` / `WorkspaceInitEffects` / `workspace-init` store / `workspaces/procedures/create.ts` / `workspace-creation.ts`）当前仍在为 **v1 shell** 提供**独立的 Electron `workspaces` / `worktrees` 表数据源**：
  - `NewWorkspaceModal/PromptGroup.tsx` 深度依赖 `.mutateAsyncWithPendingSetup()` / `.mutateAsyncWithSetup()` 与 `workspace-init-manager` 的 optimistic progress
  - `V1PanesWorkspace` 仍从 Electron `workspaces` 表读取显示
  - `WorkspaceInitEffects` 是 v1 shell 的 init progress 事件桥
- **正确的删除策略**：先在 v1 shell 各显示位置切到 `useWorkspaceCatalog()` / `useWorkspaceProjection()`；再让 `NewWorkspaceModal` 底层调用 `useWorkspaceLaunch().begin(...)`；`workspace-init-manager` 消费 `workspace-operation:changed` 事件；最后才能删这 6 个文件
- 规模：约 30–40 个 renderer 文件替换 + 真机 CDP 验证
- **强烈依赖 CDP 端到端验证**：任何删除都必须在 `.superset/setup.local.sh` 起来的 dev 实例上确认新工作流通畅

### Appendix A 40+ renderer identity 读位置
- 执行方式：每个位置从 `electronTrpc.workspaces.get*` / `useLiveQuery` over `v2Workspaces` collection 切到 `useWorkspaceCatalog()` / `useWorkspaceProjection()`
- 出口门（M4 收尾时验证）：
  ```
  rg -n 'workspaces\.create|project\.create|project\.setup|workspaceCreation\.adopt' apps/desktop/src/renderer packages/trpc/src
  rg -n 'localDb\.(insert|update|delete)\((projects|workspaces|worktrees)\)' apps/desktop/src/lib/trpc/routers
  rg -n 'electronTrpc(Client)?\.workspaces\.(get|getAll|getAllGrouped|getPreviousWorkspace|getNextWorkspace)' apps/desktop/src/renderer
  ```

### M2 深度剩余
- **Full resume worker 从 step checkpoint 恢复**：目前 sweep 只把 pre-commit / post-commit 孤儿分别 failed(retryable=true)；真正 resume worker 应能在 boot 时从 `workspace_operation_steps` 最新 stage 继续 saga（不是让客户端手动重试）。等 sources/ handler 拥有直接 git 算法（脱离 caller 委托）之后再做
- **sources/ handler 内嵌 git 算法**：目前仍通过 `appRouter.createCaller(ctx)` 委托 `workspaces.create` 等；下一步是把 git worktree/PR/branch 算法从 tRPC procedure 抽入 sources 内，让 procedure 变成 provisioning-only 兼容层

### M5 端到端证据
- 12 项 CDP acceptance journey 未执行（需 desktop 真实 dev instance + AGENTS.md 的 CDP 匹配流程）
- lint / typecheck / test 每次都在 commit 中记录了当轮结果

## 参考
- Architecture: `plans/20260731-workspace-catalog-launch-architecture.md`
- ExecPlan: `plans/20260731-workspace-catalog-launch-execplan.md`
