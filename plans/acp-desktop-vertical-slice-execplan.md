# 桌面端 ACP 端到端竖切执行计划

状态：**提案**
上层方案：[`plans/acp-agent-control-plane.md`](./acp-agent-control-plane.md)
范围：**单用户、本地桌面端、仅 Claude ACP**

## 1. 交付目标

交付一条最薄但完整的链路：

```text
桌面端 Workspace UI
  -> 桌面端 ACP 启动模块
  -> host-service acpSessions 路由与 WebSocket 流
  -> AcpSessionManager
  -> claude-agent-acp 子进程
  -> 原生 ACP 会话 pane
```

完成后，用户可以：

1. 在当前 Workspace 中新建 Claude ACP 会话；
2. 发送文本提示；
3. 实时查看消息、计划和工具调用；
4. 处理权限请求和 `AskUserQuestion` 提问；
5. 修改 ACP mode 和 Agent 暴露的配置项；
6. 取消正在执行的 turn；
7. 关闭并重新打开会话 pane；
8. 重启 host-service 后恢复同一个 Claude 原生会话；
9. 继续正常使用现有 terminal Agent。

本计划只搭第一条可日常使用的竖切，不实现自动路由、共享上下文、Planner/Executor、Runtime Profile 或通用多 Adapter 框架。

## 2. 已核对的 `main` 基线

### 2.1 Host 侧已经存在

- `packages/host-service/src/runtime/acp-sessions/acp-sessions.ts`
  - 每个活动会话启动一个 `claude-agent-acp` 子进程；
  - 支持 create、load、prompt、cancel、permission、elicitation、mode 和 config；
  - 在 host SQLite 中持久化公开 session id 到原生 ACP session id 的映射；
  - 通过内存 journal 产生有序 envelope。
- `packages/host-service/src/trpc/router/acp-sessions/acp-sessions.ts`
  - 暴露 `list/create/get/getMessages/prompt/respondToPermission/cancel/setMode/setConfigOption`。
- `packages/host-service/src/runtime/acp-sessions/stream.ts`
  - 暴露 `/acp-sessions/:sessionId/stream?since=<seq>`。
- `packages/session-protocol`
  - 已有共享 ACP 类型、timeline fold、重连客户端和 React hooks。

### 2.2 桌面端仍然缺失

- desktop 没有导入 `@superset/session-protocol`；
- desktop 没有 ACP pane kind；
- `AgentSessionLaunchAdapterKind` 仍然只支持 terminal；
- `AcpSessionManager` 仅通过 `SUPERSET_ACP_SESSIONS=1` 在 dev/canary host 子进程中启用；
- 当前 `ContentView` 对 Workspace 直接挂载 `V1PanesWorkspace`；
- 当前 pane registry 只有 `terminal`、`file-viewer` 和 `comment`；
- pane layout 持久化在 `v2WorkspaceLocalState.paneLayout`。

### 2.3 文档存在漂移

`packages/host-service/docs/acp-sessions.md` 和相关计划仍然描述 mobile 消费端，但当前 `main` 只有 `apps/api` 和 `apps/desktop`。目前没有 app 消费 `@superset/session-protocol` 或 `@superset/host-client`。

实施时必须先按当前仓库修正文档基线，不能假设存在可直接迁移的 mobile UI。

## 3. 已锁定的实现决策

### 3.1 只接入当前 panes workspace

实现位置：

```text
apps/desktop/src/renderer/screens/main/components/WorkspaceView/
  ContentView/TabsContent/V1PanesWorkspace/
```

第一版不接旧 mosaic/tab renderer。当前 `ContentView` 已经把 Workspace 渲染交给 `V1PanesWorkspace`。

### 3.2 ACP 是新的 pane kind

持久化数据：

```ts
interface AcpPaneState {
  sessionId: string;
  agentDefinitionId: "claude";
  title?: string;
  status?: SessionStatus;
}
```

`sessionId` 是公开的 Superset ACP session id。原生 ACP session id 永远不能进入 renderer 持久化状态。

pane identity 和 session identity 必须分开：

- pane id 负责布局；
- ACP session id 负责 runtime 和历史；
- 关闭 pane 只会解除 UI 附着，不会删除会话历史。

### 3.3 先创建 session，再打开 pane

启动模块顺序固定：

1. 生成 UUID；
2. 使用已解析的 host Workspace id 调用 `acpSessions.create`；
3. create 成功后才写入 pane layout。

恢复持久化 pane 时禁止调用 `create`。恢复路径只调用 `get/getMessages/stream`；如果 registry row 为 offline，`getMessages` 会触发 `session/load`。

这样可以避免 React remount 产生副作用或重复 session。

### 3.4 第一版保留 ACP 专用启动模块

暂时不扩展 terminal-only 的 `agent-session-orchestrator`。

原因：

- 当前 orchestrator 绑定 legacy tabs adapter；
- 当前 `V1PanesWorkspace` 使用另一套持久化 panes store；
- 强行统一会把 session 创建、两套 pane store 和协议选择混进同一个改动。

第一版建立小型 ACP 启动模块，并继续使用现有 `AgentDefinitionId`。竖切验证完成、pane store 方向稳定后，再并入通用 Agent 启动模块。

### 3.5 复用现有 typed desktop tRPC client

命令调用使用 `getHostServiceClientByUrl(hostUrl)`。React session hook 通过一个薄绑定获得结构化 `AcpSessionsApi`。

WebSocket URL 使用：

- 本地 `hostUrl`；
- `/acp-sessions/:sessionId/stream`；
- 每次重连重新读取 `getHostServiceWsToken(hostUrl)`。

desktop 不接入 `@superset/host-client`，也不再手写一套 tRPC transport。

### 3.6 ACP 使用独立呈现层

第一版不把 ACP timeline 转成 Mastracode `UIMessage`。`packages/session-protocol` 已有经过测试的 ACP timeline model。

ACP 使用独立 renderer，同时复用已有视觉基础件：

- `@superset/ui/ai-elements/message` 渲染 markdown；
- 现有 button、dropdown、badge、scroll container；
- ACP 数据足够时复用现有 diff/file viewer。

无法识别的 ACP 内容必须显示明确 fallback，不能静默丢弃。

### 3.7 使用 host capability 作为内部开关

UI 调用 `acpSessions.list` 并读取 `enabled`：

- `enabled: true`：显示 ACP 新建和重新打开入口；
- `enabled: false`：隐藏入口，不影响 terminal UI；
- 已持久化 ACP pane 遇到 disabled host：显示“当前 host 未启用 ACP”，不能显示空白会话。

第一条内部竖切不新增 PostHog flag。

### 3.8 关闭 pane 只解除附着

当前 host runtime 没有 delete、forget 或 suspend 操作。内部版本采用：

- 关闭 idle pane：直接解除附着；
- 关闭 running 或 awaiting-permission pane：先确认，再 best-effort `cancel`；
- 最近会话通过 `acpSessions.list` 重新打开；
- Adapter 进程继续由 host 管理，直到进程退出或 host 关闭。

进入 stable 前必须设计有界的 suspend/forget 生命周期，但不能把破坏性删除偷偷塞进 pane close。

## 4. 完整交互流程

### 4.1 新建会话

```text
用户点击 ACP 菜单 -> 新建 Claude 会话
  -> 解析本地 host URL 和 host Workspace id
  -> capability probe 返回 enabled
  -> desktop launch 模块生成 session id
  -> acpSessions.create
  -> host 启动 claude-agent-acp
  -> initialize + session/new
  -> host 持久化 registry row
  -> desktop 添加 { kind: "acp", data.acp.sessionId }
  -> AcpSessionPane 执行 get + getMessages + WS attach
  -> composer 可用
```

### 4.2 发送 prompt

```text
用户提交文本
  -> session.actions.prompt([{ type: "text", text }])
  -> mutation 仅确认已接收
  -> user/agent chunk 通过 WS 到达
  -> timeline fold 更新 pane
  -> state frame 更新 running/idle/awaiting_permission
```

composer 只能在 prompt admission 成功后清空。失败时保留草稿并显示错误。

### 4.3 权限请求和 Agent 提问

```text
ACP request_permission 或 elicitation/create
  -> host 暂存 resolver
  -> permission_requested envelope
  -> state/timeline 出现 pending request
  -> pane 渲染协议提供的全部选项
  -> 用户选择
  -> respondToPermission
  -> permission_resolved envelope
```

不能只硬编码“允许/拒绝”。必须使用协议提供的 option label 和 outcome。多选 elicitation 使用 `makeSelectedOutcome`。

### 4.4 Host 重启恢复

```text
Host 退出
  -> pane layout 仍然存在
  -> 新 host 将 registry row 载入为 offline
  -> pane get 显示 offline
  -> getMessages 调用 ensureLive
  -> host 启动 Adapter 并 session/load
  -> 原生 transcript 回放
  -> pane 连接新 stream
```

原生 transcript 缺失时显示“Session could not be resumed”，禁止静默创建替代 session。

### 4.5 重新打开会话

```text
用户打开 ACP 菜单 -> 最近会话
  -> acpSessions.list({ workspaceId })
  -> 选择 session
  -> 如果 pane 已打开，则聚焦
  -> 否则使用相同 session id 新建 pane
```

MVP 策略：同一 Workspace 内优先聚焦已有 pane，不自动创建同 session 的第二个订阅 pane。

## 5. 文件级实施计划

所有组件遵循一个组件一个目录，并就近放置测试和依赖。

### 5.1 增加 desktop 依赖

修改：

- `apps/desktop/package.json`

增加：

```json
"@superset/session-protocol": "workspace:*"
```

renderer 不直接依赖 ACP SDK。所有 ACP 类型从 `@superset/session-protocol` 进入。

### 5.2 Desktop ACP client 绑定

新增：

```text
apps/desktop/src/renderer/lib/acp-session-client/
  acp-session-client.ts
  acp-session-client.test.ts
  index.ts
```

接口：

```ts
interface DesktopAcpSessionClient {
  api: AcpSessionsApi;
  create(input: {
    sessionId: string;
    workspaceId: string;
  }): Promise<SessionScopedState>;
  list(input: {
    workspaceId: string;
    cursor?: string;
    limit?: number;
  }): Promise<SessionsPage>;
  streamUrl(sessionId: string): () => string;
}

function createDesktopAcpSessionClient(
  hostUrl: string,
): DesktopAcpSessionClient;
```

实现要求：

- 所有命令代理到 `getHostServiceClientByUrl(hostUrl).acpSessions.*`；
- session id 写入 WS path 前必须编码；
- URL factory 每次执行时重新读取 `getHostServiceWsToken(hostUrl)`；
- 没有 token 时不添加 `token` query；
- 不包含 React 状态；
- 不包含 fold 或 timeline 逻辑。

测试：

- 每个方法映射到正确的 tRPC query/mutation；
- WS path 正确编码 session id；
- 重连 URL factory 能读取变化后的 token；
- `http` 转 `ws`，`https` 转 `wss`。

### 5.3 Desktop ACP 启动模块

新增：

```text
apps/desktop/src/renderer/lib/acp-session-launch/
  acp-session-launch.ts
  acp-session-launch.test.ts
  index.ts
```

接口：

```ts
interface LaunchAcpSessionInput {
  workspaceId: string;
  agentDefinitionId: AgentDefinitionId;
  client: DesktopAcpSessionClient;
  openPane(input: {
    sessionId: string;
    agentDefinitionId: AgentDefinitionId;
    title: string | null;
  }): void;
  sessionId?: string;
}

interface LaunchAcpSessionResult {
  sessionId: string;
  state: SessionScopedState;
}
```

第一版约束：

```ts
agentDefinitionId === "claude"
```

第二个真实 ACP Agent 出现前不建立虚假的 Adapter registry。其他 Agent id 返回明确 unsupported error。

执行顺序：

1. 验证 Agent id；
2. 使用传入 id 或 `crypto.randomUUID()`；
3. 调用 create；
4. 成功后调用一次 `openPane`；
5. 返回结果。

测试：

- create 一定早于 openPane；
- create 失败时不打开 pane；
- 传入固定 session id 时可幂等重试；
- unsupported Agent 在网络调用前失败；
- pane data 不复制完整 session state。

### 5.4 ACP pane 持久化状态

修改：

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/types.ts`

增加嵌套字段：

```ts
acp?: {
  sessionId: string;
  agentDefinitionId: AgentDefinitionId;
  title?: string;
  status?: SessionStatus;
};
```

只持久化可序列化 metadata。禁止存储 socket、actions、Promise、timeline 或原生 ACP id。

扩展现有 pane layout 测试，覆盖：

- store 写入持久化 layout；
- 持久化 layout remount；
- Workspace 切换；
- ACP 数据缺失或损坏时安全显示错误。

### 5.5 ACP pane 组件树

新增：

```text
apps/desktop/src/renderer/screens/main/components/WorkspaceView/
  ContentView/TabsContent/AcpSessionPane/
    AcpSessionPane.tsx
    AcpSessionPane.test.tsx
    index.ts
    components/
      AcpSessionHeader/
        AcpSessionHeader.tsx
        index.ts
      AcpTimeline/
        AcpTimeline.tsx
        index.ts
        components/
          AcpMessageItem/
            AcpMessageItem.tsx
            index.ts
          AcpPlanItem/
            AcpPlanItem.tsx
            index.ts
          AcpToolCallItem/
            AcpToolCallItem.tsx
            index.ts
            components/
              AcpPermissionCard/
                AcpPermissionCard.tsx
                index.ts
          AcpContentBlock/
            AcpContentBlock.tsx
            index.ts
          AcpUnknownContent/
            AcpUnknownContent.tsx
            index.ts
      AcpComposer/
        AcpComposer.tsx
        index.ts
      AcpSessionError/
        AcpSessionError.tsx
        index.ts
      AcpConfigControls/
        AcpConfigControls.tsx
        index.ts
```

`AcpSessionPane` props：

```ts
interface AcpSessionPaneProps {
  sessionId: string;
  hostUrl: string;
  onSessionMetadataChange(input: {
    title: string | null;
    status: SessionStatus;
  }): void;
}
```

职责：

- 基于 `hostUrl` 创建 desktop client 绑定；
- 调用 `useAcpSession`；
- 调用 `useAcpPermissions`；
- 渲染 loading、error、offline 和 live 状态；
- 把 title/status 变化同步回 pane data；
- 独立拥有当前 pane 的 scroll 状态。

禁止在组件 mount 时创建 session 或修改 pane layout。

#### Timeline 渲染

覆盖全部现有 `TimelineItem`：

- `message`；
- `tool_call`，包括嵌套 children；
- `plan`。

覆盖全部 ACP content block：

- `text`：markdown message；
- `image`：校验后展示 data/URL 图片；
- `audio`：第一版显示 metadata 和明确的暂不支持播放状态；
- `resource_link`：显示 URI，并使用现有安全打开逻辑；
- `resource`：显示 embedded resource 摘要，可展开文本或原始内容。

工具调用展示：

- title；
- kind；
- status；
- locations；
- structured content；
- diff content；
- 折叠后的 raw input/output；
- nested subagent children；
- pending/resolved permission。

unknown 或 extension 内容显示诊断 fallback。主 timeline 不直接渲染无限大小 JSON；默认截断，用户显式展开后再显示。

#### Composer

第一版只支持文本：

- `Enter` 提交；
- `Shift+Enter` 换行；
- loading、offline、dead 或 prompt admission 期间禁用；
- running 时显示 Cancel；
- admission 失败保留草稿；
- 暂不支持附件、mention、slash command。

#### Mode 和 config

完全根据 ACP state 渲染，不硬编码 Claude model 名称：

- available modes 和 current mode；
- select config option；
- boolean config option；
- 当前 value；
- mutation 进行中只禁用对应 control；
- 最终状态以 stream update 为准。

### 5.6 注册 ACP pane

修改：

- `.../V1PanesWorkspace/useV1PanesWorkspace.tsx`
- `.../V1PanesWorkspace/buildV1PanesLifecycleRegistry.ts`
- 对应 registry/lifecycle tests。

新增 `acp` definition：

- icon：Agent/message 图标，根据状态变色；
- title：优先 ACP title，fallback 为 `Claude`；
- render：metadata 和 host URL 有效时渲染 `AcpSessionPane`；
- host 未就绪或 ACP disabled 时显示 unavailable；
- close label：`Close agent session`；
- 不复用 terminal 的 clipboard、clear、kill action。

Metadata 同步：

```text
AcpSessionPane title/status
  -> ctx.actions.updateData
  -> persisted pane layout
  -> tab/sidebar status projection
```

只有 title/status 真的变化时才写入，避免循环更新。

关闭保护：

- idle/offline/dead：直接关闭；
- running/awaiting_permission：弹确认；
- 用户确认后 best-effort `cancel`，然后解除 pane；
- cancel 失败不能把 pane 永久卡住，但要记录日志并显示 toast。

测试：

- registry 包含 `acp` renderer/title/icon；
- malformed ACP data 安全降级；
- running 触发确认；
- idle 不触发确认；
- ACP close 不调用 terminal kill；
- metadata 只更新目标 pane。

### 5.7 新建与最近会话入口

新增：

```text
.../V1PanesWorkspace/components/AcpSessionMenu/
  AcpSessionMenu.tsx
  AcpSessionMenu.test.tsx
  index.ts
```

如果该组件只被 `V1PanesPresetBar` 使用，则按项目结构放到 `V1PanesPresetBar/components/` 下。

修改：

- `V1PanesPresetBar.tsx`
- `V1PanesWorkspace.tsx` 或 `useV1PanesWorkspace.tsx`，提供 ACP pane opener。

菜单行为：

- 调用 `list({ workspaceId, limit: 20 })`；
- feature disabled 时隐藏；
- `New Claude ACP session` 通过 `launchAcpSession` 创建；
- 最近会话显示 title、status、updated time；
- 选择已打开 session 时聚焦已有 pane；
- 选择已关闭 session 时添加到 active tab；
- 没有 active tab 时新建 tab；
- create 进行中禁用重复点击；
- list/create 错误不能影响 terminal controls。

第一版入口明确标记为内部 Claude ACP，不展示 Agent/model 自动路由。

### 5.8 修正文档

修改：

- `packages/host-service/docs/acp-sessions.md`
- `plans/acp-session-follow-ups.md`
- `plans/done/20260726-v1-shell-v2-base-fusion.md`

内容：

- 删除已不存在 mobile app 的 current-topology 描述；
- 上线后补充 desktop ACP pane；
- 记录 close-as-detach 语义；
- 记录 Adapter 进程 retention/suspend/delete 缺口；
- 只有真实桌面 E2E 通过后，才把 shell-fusion 的 ACP milestone 标为完成。

## 6. 建议拆分的 PR

### PR 1：Desktop client 绑定与启动模块

交付：

- desktop dependency；
- ACP client binding；
- ACP launch module；
- 单元测试；
- 暂无 UI 入口。

验收：

- 测试证明命令映射、WS auth URL 和 create-before-open 顺序；
- host runtime 不变；
- terminal launch 行为不变。

### PR 2：可读写 ACP pane

交付：

- ACP pane data；
- pane registry；
- timeline、composer、permission、question、plan、tool call；
- mode/config controls；
- pane 持久化恢复。

验收：

- 将测试 session id 放入 pane layout 后可以完整交互；
- malformed data 和 unavailable host 有明确错误；
- pane mount 不创建 session。

### PR 3：新建与重新打开 UX

交付：

- capability-gated menu；
- 创建新 session；
- list/reopen recent session；
- 聚焦已打开 pane；
- close guard 和 running-close cancel。

验收：

- 用户不借助 devtools 即可走完整流程；
- ACP disabled 时 terminal preset/run UI 完全不变。

### PR 4：恢复与加固

交付：

- host restart UX；
- load failure 展示；
- reconnect/reset 验证；
- 长 transcript 与 load-older UX；
- 文档修正；
- 真实 Claude 验收。

验收：

- host restart 后恢复原 session；
- native transcript 缺失时不创建替代 session；
- reconnect 后无可见重复消息；
- 文档与当前代码一致。

### Stable 前置 follow-up：session 生命周期

明确设计并实现以下一种操作：

- suspend runtime，但保留 registry/history；或
- forget session，并在协议支持时删除本地 history/native session。

pane close 不能隐式执行破坏性删除。retention/GC 必须先有文档化语义。

## 7. 测试计划

### 7.1 单元测试

开发时运行 focused tests：

```bash
bun test \
  apps/desktop/src/renderer/lib/acp-session-client/acp-session-client.test.ts \
  apps/desktop/src/renderer/lib/acp-session-launch/acp-session-launch.test.ts
```

运行 session protocol tests：

```bash
cd packages/session-protocol
bun test
```

相关 pane tests 使用 focused path。全仓测试禁止使用 bare `bun test`。

### 7.2 确定性 host 测试

现有 fake Adapter tests 必须继续通过：

```bash
cd packages/host-service
bun test \
  test/integration/acp-host-client.e2e.test.ts \
  test/integration/acp-sessions.integration.test.ts \
  test/integration/acp-sessions-stream.integration.test.ts
```

增加或确认以下场景：

- create -> initial state；
- prompt admission -> stream completion；
- permission options；
- `AskUserQuestion` 单选和多选；
- cancel；
- manager rebuild -> offline -> load；
- missing native transcript；
- duplicate subscribe/reconnect；
- list/reopen。

### 7.3 真实 Claude 测试

runtime、protocol 或 interaction 改动后必须运行：

```bash
cd packages/host-service
ACP_E2E=1 ACP_E2E_MODEL=sonnet ACP_E2E_EFFORT=low \
  bun test \
    test/integration/acp-sessions.integration.test.ts \
    test/integration/acp-sessions-stream.integration.test.ts
```

这组测试验证真实 Adapter/model seam。fake Adapter 不能替代它。

### 7.4 静态检查

每个 PR 前执行：

```bash
bun run lint:fix
bun run lint
bun run typecheck
bun run test
```

全仓测试必须使用 `bun run test`。

### 7.5 Desktop E2E 证据

必须使用当前 worktree 对应的 dev instance，并记录：

- worktree path；
- renderer URL/port；
- active route 和 Workspace id；
- host URL 和 host Workspace id；
- ACP session id。

需要截图和状态数据：

1. 只有 capability enabled 时才出现 ACP 菜单；
2. 新 session 首次 prompt 前；
3. streamed response 和 tool call；
4. permission 回答前后；
5. `AskUserQuestion` 回答前后；
6. turn 中途 cancel；
7. pane 关闭和重新打开；
8. host restart 后 offline -> resumed；
9. missing transcript failure；
10. 相邻 terminal Agent 仍可工作。

证据要求：

- 使用真实鼠标和键盘操作，不能直接修改 DOM；
- 必须实际重启 host，组件 remount 不算；
- screenshot 和测得的 session status/route 必须一致；
- 分开报告 fake Adapter、真实 Claude 和桌面 UI E2E 结果。

## 8. Loading 和失败状态

pane 必须区分：

- host starting；
- ACP disabled；
- session initial load；
- offline registry row 正在恢复；
- stream reconnecting；
- live idle；
- running；
- awaiting permission；
- dead Adapter；
- session not found；
- native transcript missing/load failed；
- malformed/unknown payload fallback。

reconnect 或 resync 时不能用空白 spinner 替换已有 timeline。保留现有数据，只单独显示连接状态。

## 9. 安全要求

- native ACP session id 不进入 renderer；
- host token 不进入 pane state、持久化数据或日志；
- WS path 中的 session id 必须编码；
- unknown/raw payload 只能按文本渲染，不能作为 HTML；
- external/resource link 使用现有安全打开方式；
- 不得静默启用 `bypassPermissions`；
- permission option 按协议原样呈现；
- 关闭 pane 不能等价于批准权限；
- 不改生产数据库；
- transcript 不上传云端。

## 10. 回滚方案

功能继续受 host ACP capability 控制。

回滚步骤：

1. 隐藏 ACP 新建入口；
2. 已持久化 ACP pane 显示 unavailable 说明；
3. terminal pane 保持不变；
4. host registry row 和 native transcript 留在本地，可后续恢复；
5. 禁止把 ACP pane 静默转换为 terminal pane。

pane state 使用现有 JSON layout，不需要 DB migration。host registry schema 已经存在。

## 11. 明确延期

- 第二个 ACP Agent；
- Adapter registry/seam；
- Runtime Profile；
- 人工或自动路由；
- Planner/Executor；
- 共享 Context View；
- composer 附件和图片；
- slash command 和 mention；
- paired-phone presentation and reconnect flows；
- session delete/forget/GC；
- ACP timeline 与 Mastracode `UIMessage` 合并；
- stable channel 启用。

## 12. 最终退出条件

以下条件全部满足后，竖切才算完成：

- desktop 可通过可见 UI 创建 Claude ACP session；
- pane 持久化并恢复，且不重复 create；
- text、thought、plan 和 tool update 正确渲染；
- 每种 content block 都有 renderer 或明确 fallback；
- permission 和 elicitation 可以回答；
- mode/config 可以修改；
- cancel 可用；
- close/reopen 可用；
- host restart 恢复同一个 native session；
- load failure 明确可见；
- terminal path 不受影响；
- deterministic host tests 通过；
- authenticated real-Claude tests 通过；
- desktop E2E screenshot 与状态数据完成；
- 文档不再把已删除 mobile code 描述为当前 topology。
