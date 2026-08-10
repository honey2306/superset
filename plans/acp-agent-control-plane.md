# ACP Agent 控制层方案

状态：**提案**

首个可执行竖切：[`plans/acp-desktop-vertical-slice-execplan.md`](./acp-desktop-vertical-slice-execplan.md)

## 目标

在现有 ACP session 能力上建立 Superset 自己的 Agent 控制层，让个人用户可以：

1. 用统一原生 UI 使用多个支持 ACP 的 Agent；
2. 由 Superset 控制 Agent、模型、模式和运行位置的选择；
3. 让强模型负责高价值决策，让便宜模型执行明确步骤；
4. 按任务类型使用更擅长的 Agent；
5. 保留 terminal Agent，ACP 不是唯一运行方式。

本计划不把“支持 ACP”本身当作产品目标。ACP 是结构化执行通道；Superset 的价值来自统一控制、可验证执行和后续路由能力。

## 方案复核

### 结论

方向合理，但必须收窄并分阶段验证。

合理的部分：

- 现有 ACP 已提供消息、工具调用、权限、提问、取消、恢复等结构化能力，适合作为原生 Agent UI 的底座；
- host-service 已经拥有 workspace cwd、运行进程和本地 session registry，控制层放在 host 侧符合现有所有权；
- 现有 `AgentDefinition`、`AgentLaunchRequest` 和模型配置已经能表达部分选择信息，可以演进，不应新建第四套 Agent catalog；
- 用户希望解决的核心问题确实是“哪个运行组合完成哪个工作”，而不是单纯换一套聊天 UI。

需要修正的部分：

- 不做 ACP-only 架构。terminal 和现有 Mastracode chat 在迁移期继续存在；
- 不立即建设复杂 Task DAG、自动学习、完整共享记忆；这些都需要真实使用数据证明；
- 不把 Agent 输出直接当共享事实，也不把完整 transcript 默认传给另一个 Agent；
- 不把 `agentId`、`runtime`、`model`、`mode` 合并为一个概念；
- 不先抽象一个只有 Claude 实现的通用 Adapter 接口。当前 `adapterEntry` 只是测试注入点；第二个真实 ACP Adapter 接入时再提取稳定 seam；
- 不新增一个含义冲突的 `Task` 聚合。仓库已经有项目管理 Task。第一阶段只记录 Agent Run，并可选关联现有 task id/slug；更高层工作的正式命名以后单独决定。

### 当前代码事实

当前实现存在三条并行路径：

```text
Terminal agents
  AgentDefinition -> AgentLaunchRequest -> terminal runtime

Mastracode chat
  ChatAgentDefinition -> ChatRuntimeManager

ACP
  AcpSessionManager -> hard-coded claude-agent-acp child
```

ACP 当前情况：

- `HarnessKind` 只有 `claude-agent-acp`；
- `AcpSessionManager` 生产路径固定解析并启动 `claude-agent-acp`；
- 一个 Superset ACP session 对应一个 native ACP session；
- desktop 尚未消费 ACP UI；
- 当前 main 只有 `apps/api` 和 `apps/desktop`，没有 app 消费 `@superset/session-protocol` 或 `@superset/host-client`；现有 ACP 文档中的 mobile UI/source map 已经失效，实施前需先修正文档基线；
- history、严格运行时校验、cursor incarnation 和 package split 仍由 `plans/acp-session-follow-ups.md` 跟踪。

因此第一步不是自动路由，而是证明两个真实 Agent 可以通过同一控制和 UI 路径运行。

## 核心概念

### Agent 定义

描述用户认识的 Agent，例如 Claude Code、Codex、Vibe。沿用现有 `AgentDefinition` catalog。

### 运行配置

一次可选择的运行组合：

```text
Agent + protocol/runtime + model + mode + capabilities + cost tier
```

示例：

```text
Claude Code + ACP + Sonnet + default
Claude Code + ACP + Opus + plan
Codex + ACP + default model + workspace-write
Vibe + terminal + configured model
```

Runtime Profile 是路由选择单位。Agent 名称不是能力和成本的充分描述。

### Agent 执行记录

记录一次实际执行：

- workspace；
- Runtime Profile；
- 可选的现有 task 关联；
- session/terminal id；
- 来源和选择原因；
- 开始、结束、状态；
- 验证结果、耗时和可得成本数据。

Run 不拥有 workspace，也不替代 ACP/native session。它是 Superset 对一次执行的统一记录。

### 上下文视图（后续阶段）

不是公共 transcript。它是针对当前 Run 编译的最小上下文：

- 目标；
- 约束；
- 已确认决策；
- 相关文件或产物引用；
- 验收条件；
- 需要升级给强模型的条件。

原始代码、日志和完整历史优先通过引用按需读取，不重复塞入 prompt。

## 目标架构

```text
Desktop / Mobile UI
        |
        v
Agent Run control
  - create / cancel / resume
  - profile selection
  - status / evidence
        |
        v
Runtime dispatch
  - ACP path
  - terminal path
  - existing chat path during migration
        |
        +--> Claude ACP Adapter
        +--> second real ACP Adapter
        +--> Terminal Runtime
```

架构原则：

1. Workspace Catalog 继续拥有 workspace 身份；
2. host-service 继续拥有本地运行生命周期；
3. pane/UI 只附着到 run/session id，不拥有运行状态；
4. ACP 保留原始 payload，但 UI 消费稳定的 Superset session/timeline 状态；
5. Agent-specific 能力通过 capabilities 暴露，不强行伪装一致；
6. transcript 和代码默认留在本机；
7. transport、ACP protocol、Agent routing 是不同层，不能混为一体。

## 路由策略

### 第一阶段：手动选择

用户选择 Agent/Profile。系统提供少量入口：

- Fast；
- Balanced；
- Best；
- Custom。

系统记录最终 Profile 和用户覆盖行为。

### 第二阶段：简单规则

只做可解释规则：

- 复杂规划、高歧义、高风险 -> 强 Profile；
- 步骤明确、低风险执行 -> 便宜 Profile；
- 特定能力要求 -> 过滤不支持的 Profile；
- 连续验证失败 -> 升级到强 Profile。

规则先过滤硬能力，再根据质量/成本偏好排序。不要让 Router LLM 在所有组合中自由猜测。

### 第三阶段：数据推荐

记录：

- 是否完成；
- test/lint/typecheck 等验证是否通过；
- 是否返工或升级；
- 时间；
- token/费用（运行时能提供时）；
- 用户是否手动换 Agent。

数据足够后，按相似工作推荐历史成功率高、总成本低的 Profile。初期不训练模型，不做黑盒自动学习。

## 实施阶段

### 阶段 0：能力验证和产品界面

目标：确认统一 ACP 客户端对个人使用确实比 terminal 更好。

- desktop 增加 ACP session 原生 pane；
- 复用现有 session protocol、stream、permission 和 resurrection；不假设已有可移植的 app UI；
- 保留 terminal fallback；
- 展示实际 Agent、模型、mode 和连接状态；
- 完成 Claude ACP 的日常使用验证。

退出条件：同一 workspace 中 ACP pane 可作为 Claude 的日常使用入口，权限、提问、取消和恢复可靠。

### 阶段 1：第二个真实 ACP Agent

目标：证明统一 seam 是真实需求，不是对 Claude 的过度抽象。

- 选择一个真实可用且支持 ACP 的第二 Agent；
- 接入其启动、initialize/new/load、配置和退出行为；
- 记录两者 capability 差异；
- 第二个 Adapter 工作后，再从 `AcpSessionManager` 提取 Adapter registry/seam；
- persistence 记录 adapter/profile identity，确保恢复时启动正确 Adapter。

退出条件：两个真实 ACP Agent 使用同一 session UI 和控制路径；各自不支持的能力被明确降级，而非静默失败。

### 阶段 2：运行配置与 Agent 执行记录

目标：让 Superset 拥有选择和观测能力。

- 扩展现有 Agent catalog，避免建立独立 catalog；
- 建立 Runtime Profile 解析；
- 建立最小 Agent Run 记录；
- 统一 ACP 和 terminal 启动入口的选择信息；
- UI 提供 Fast/Balanced/Best/Custom 和明确的实际选择结果；
- 记录运行结果和用户 override。

退出条件：每次启动都能回答“用了哪个 Agent、哪个模型、为什么、结果如何”。

### 阶段 3：规划者 / 执行者小闭环

目标：验证强模型决策、便宜模型执行是否降低总成本。

只支持两种角色：

- Planner：生成明确执行说明、约束和验收条件；
- Executor：完成步骤，返回 completed/blocked/plan-invalid。

限制：

- 不做任意 DAG；
- 不默认传完整 transcript；
- Executor 发现计划假设错误时必须升级；
- host 执行确定性验证，不能信任 Agent 自报完成。

退出条件：真实样本中，总成本下降且验证通过率没有明显下降。否则停止扩展自动编排。

### 阶段 4：规则路由与推荐

目标：减少手动选择，不隐藏决策。

- 根据工作类型、风险和能力做简单路由；
- 用户随时覆盖；
- 显示选择原因和升级条件；
- 只在低风险工作探索新 Profile；
- 历史结果只作为推荐，不作为永久能力标签。

退出条件：自动建议被用户接受，且相对固定默认 Profile 有可测量收益。

### 阶段 5：按需上下文视图

仅在多 Run 交接已产生真实痛点后实施：

- 目标、约束、决策、证据和引用分开；
- Agent 输出默认是未验证声明；
- workspace 文件和 host 命令结果优先作为证据；
- snapshot 绑定 workspace revision，变化后验证可标记 stale；
- 不横向继承高风险权限。

## 与现有计划的关系

- `plans/acp-session-follow-ups.md`：继续负责 ACP history、validation、cursor、client state 和 package split。本计划不复制这些底层工作；其 current topology/source map 含已删除的 mobile 路径，实施前先按 main 更新；Phase 0/1 上线前必须根据改动范围完成对应 P0/P1 项。
- `plans/20260726-v1-shell-v2-base-fusion.md`：其 ACP pane milestone 可作为本计划 Phase 0 的 UI 落点，但 terminal 仍是 fallback。
- `plans/v2-chat-greenfield-architecture.md`：包含 Mastracode chat 的事件和 client store 方向。不能再独立发明第三套通用 timeline/event log；实施前需要明确 ACP session protocol 与 chat event model 的收敛方案。
- `plans/20260417-automations.md`：继续使用现有 `AgentLaunchRequest`。未来 Runtime Profile 应扩展该入口，而不是为 automations 创建专用路由。

## 非目标

当前不做：

- 多人协作；
- 企业治理；
- Agent marketplace；
- 全自动任务分解；
- 复杂 DAG workflow；
- AI 自训练 Router；
- 跨 Agent 共享完整 transcript；
- ACP 替代全部 terminal Agent；
- 为统一而抹平 Agent-specific 功能。

## 主要风险与控制

### ACP 覆盖不足

控制：terminal 永久保留为运行通道；只有第二个真实 ACP Adapter 出现后才固化 seam。

### 统一 UI 退化为最低公分母

控制：稳定核心 timeline + capability slots + unknown/raw fallback。

### 编排成本高于直接使用强模型

控制：Planner/Executor 只做小闭环；以总成本、返工和验证通过率作为继续投入条件。

### 历史数据快速过期

控制：结果绑定 Profile、Agent/model 版本和时间；旧版本数据衰减，不作为永久评分。

### 与现有 chat/ACP 架构重复

控制：先做收敛决策；复用现有 Agent catalog、launch request、host runtime 和 session protocol，不新增平行基础设施。

### 过早存储敏感 transcript

控制：第一阶段只存 registry、run metadata 和验证摘要；消息历史继续遵循 ACP follow-up 的本地持久化策略。

## 成功指标

个人使用阶段只看少量指标：

1. ACP pane 是否取代部分 terminal Agent 日常使用；
2. 权限和提问是否能可靠处理；
3. 切换 Agent/Profile 是否比重新开终端更省操作；
4. Planner/Executor 是否降低总成本，而不是只降低单次模型价格；
5. 验证通过率和返工次数是否改善；
6. 用户 override 系统建议的频率是否下降。

## 推荐起点

先按 [`plans/acp-desktop-vertical-slice-execplan.md`](./acp-desktop-vertical-slice-execplan.md) 完成 Phase 0，再接入第二个真实 ACP Agent。

不要从自动路由、共享上下文或 Task DAG 开始。若统一 ACP pane 本身不能成为个人日常入口，后续控制层没有足够价值；若第二个 Agent 无法通过同一路径可靠运行，通用 Adapter 和自动选择也没有成立基础。
