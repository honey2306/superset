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
- `sources/` 子目录 6 个 handler（temporary/branch/worktree/pull-request/existing-project/project-materializers）：目前 production-runner 直接委托给旧 tRPC caller，未把 git 算法搬入模块内
- Compensation：目前只 record artifacts，不真正读回来做 rollback；execplan 要求根据 `ownership='created' vs adopted` 决定 fs 层面的清理
- Full resume worker：目前 begin 是同步 MVP，resume sweep 只把 orphan 标 failed；真正实现应能在 boot 时按 `workspace_operation_steps` 从中断 checkpoint 恢复
- Terminal Runtime Adapter：`initialSessions` 目前完全不启动 terminal
- 还差 execplan 中 execplan 中要求的另外 5 项 recovery 测试（`begin` 前后停机、retry 用 journaled terminal id、cancel 前后差异等）

### M5 端到端证据
- 12 项 CDP acceptance journey 未执行（需 desktop 真实 dev instance + AGENTS.md 的 CDP 匹配流程）
- lint / typecheck / test 每次都在 commit 中记录了当轮结果

## 参考
- Architecture: `plans/20260731-workspace-catalog-launch-architecture.md`
- ExecPlan: `plans/20260731-workspace-catalog-launch-execplan.md`
