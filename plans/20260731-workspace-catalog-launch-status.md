# Workspace Catalog Launch — 已完成里程碑与未完成清单

跟踪 `plans/20260731-workspace-catalog-launch-execplan.md` 的实际交付进度。
每个已完成里程碑在下面简要列出其产物；未完成的部分给出精确范围便于后续
接手。

## ✅ 已完成

### M0 — Characterization & collision audit
- `packages/host-service/src/workspace-catalog/collision-report.ts`
- `packages/host-service/test/integration/workspace-catalog-identity.integration.test.ts`
- `packages/host-service/test/integration/workspace-provisioning-characterization.integration.test.ts`

### M1 — Workspace Catalog module
- Drizzle migration `0012_smiling_patriot.sql` — canonical 列、
  singleton_key、catalog_identity_conflicts、catalog_changes
- `packages/host-service/src/workspace-catalog/*.ts` — WorkspaceCatalog 类、
  canonicalizeHostPath、runCatalogIdentityBackfill
- 9 条 Catalog 单测
- store 接线：`local-workspace-store` / `local-project-store` 走 Catalog；
  `persistLocalProject` 使用 Catalog；ensureMainWorkspace strict 走 Catalog；
  project delete 级联走 Catalog；project/workspace backfill 追加 Catalog 参数
- `workspaces.create` 从 `ensureMainWorkspace` 改为 `ensureMainWorkspaceStrict`
- Event: `catalog:changed` 新事件类型 + broadcast 方法
- tRPC: `workspaceCatalog.snapshot` / `.changes` 两个 procedure

### M2 — Workspace Provisioning MVP
- Drizzle migration `0013_shallow_tigra.sql` — workspace_operations 表族
- `packages/host-service/src/workspace-provisioning/*.ts` — types、
  canonical-request（SHA-256 幂等 hash + redaction）、operation-journal、
  WorkspaceProvisioning 类、production-runner（通过 createCaller 委托）
- Event: `workspace-operation:changed` 事件类型 + broadcast 方法
- tRPC: `workspaceProvisioning.begin/get/list/act` 四个 procedure
- 7 条 Provisioning 集成测试（幂等匹配/冲突、begin+success/failure、
  get、list machine-id 强制、TOO_LATE_TO_CANCEL）

### M3 — Client Launch Coordinator
- `packages/workspace-client/src/lib/workspaceProvisioning.ts` — 
  ProvisioningAdapter 接口、`createTrpcProvisioningAdapter`、
  `createInMemoryProvisioningAdapter`（含 seedOperation / enqueueOutcome /
  broadcast）、`extractAttachableLaunches`
- workspace-client eventBus 支持 `catalog:changed` 与 `workspace-operation:changed`
- `apps/desktop/src/renderer/stores/workspace-launch/` — zustand store、
  hook、selectors
- 12 条 workspace-client + store 单测

### M3b — WorkspaceCatalogProvider（骨架）
- `apps/desktop/src/renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/`
  下 4 个文件：纯 projection reducer、React Provider、hooks、导出桶
- 4 条 projection reducer 单测

## ⚠️ 未完成（后续 PR）

### M3b 收尾
- 将 `WorkspaceCatalogProvider` 挂到 `_authenticated/layout.tsx`
- 实际接线 `workspaceCatalog.snapshot` + `.changes` 拉取和 `catalog:changed`
  订阅；实现 execplan 中描述的 "snapshot 安装 + 追赶到 high-water mark" 流程
- 把 Appendix A 的 40+ renderer 文件从
  `electronTrpc.workspaces.get*` 系列切换到 `useWorkspaceCatalog()` /
  `useWorkspaceProjection()`
- 保留 v1 shell 表现（cache-first render）与 IndexedDB per-host 快照持久化

### M4 完整删除
仍在 `apps/desktop/src/lib/trpc/routers/workspaces/procedures/create.ts` 等
6 个文件当前依然有 5+ 个真实 caller（NewWorkspaceModalDraftContext、
OpenInWorkspace、RunInWorkspacePopover、`project/$projectId/page.tsx`、
useCommandWatcher 等）。删除必须与调用点迁移一起完成，否则 desktop 无法
编译。迁移策略：所有旧 caller 使用 `useWorkspaceLaunch({adapter}).begin({
  request: { idempotencyKey, project: {kind:'existing',projectId}, source: … }
})` 取代旧的 electron/host `workspaces.create.mutate`。

出口门（`rg` 无匹配）需要在完成迁移后再运行验证：
```
rg -n 'workspaces\.create|project\.create|project\.setup|workspaceCreation\.adopt' apps/desktop/src/renderer packages/trpc/src
rg -n 'localDb\.(insert|update|delete)\((projects|workspaces|worktrees)\)' apps/desktop/src/lib/trpc/routers
```

### M2 深度补齐
- Provisioning saga 目前是同步 begin+run（MVP）。以下高级项未实现：
  - Resume worker（host 重启后未完成 operation 自动恢复）
  - `workspace_operation_locks` 表的实际租约锁定（identity + operation
    lease + git-repo critical section）
  - `workspace_operation_artifacts` 表的写入（materialize/adopt ownership）
  - `sources/` 子目录的 6 个 handler（temporary/branch/worktree/pull-request/
    existing-project/project-materializers），当前直接委托给旧 tRPC caller
  - Compensation 分别处理 `ownership='created'` vs `'adopted'`
  - execplan 中要求的 6 项 recovery 测试
    （workspace-provisioning-recovery.integration.test.ts）
- Terminal Runtime Adapter — 目前 launch 不做任何 terminal spawn

### M3 收尾
- automation dispatch（`packages/trpc/src/router/automation/dispatch.ts`）
  仍调用旧 `workspaces.create`；未切到 `workspaceProvisioning.begin`
- MIN_HOST_SERVICE_VERSION（`packages/shared/src/host-version.ts`）未提升

### M5 — 端到端证据
- lint/typecheck/test 汇总运行结果见 M5 commit
- 12 项 CDP acceptance journey 未执行（需要 desktop 真实 dev instance；
  文档要求 pwd/commit/port/route/session/host/capabilities 全部记录）

## 参考
- Architecture: `plans/20260731-workspace-catalog-launch-architecture.md`
- ExecPlan: `plans/20260731-workspace-catalog-launch-execplan.md`
