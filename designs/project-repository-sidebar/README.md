# 项目与多仓库侧边栏预览

## 设计假设

- 分类表达产品 / 业务线，不承担 Git 语义。
- 项目是用户管理和创建 Workspace 的主要上下文。
- 仓库是项目下的代码边界；一个项目可关联多个仓库。
- Workspace 仍是最末级、最常点击的对象。

## v1 探索（已请求修改）

- A 紧凑树形：分类 → 项目 → 仓库 → Workspace。
- B 仓库卡片：强化仓库职责和边界。
- C 产品聚焦：用顶部分类切换减少纵向噪音。

## v2 当前结构融合（待评审）

- 保留现有 Automations / Todos / Temporary workspace / Project memory。
- 保留现有 ProjectHeader、Active / Backlog Section、Workspace 状态行、Ports 与 Add repository。
- 只在当前 ProjectHeader 上方增加“项目组”，将当前 repo-backed project 放在一起。
- A 分组标题：最小增量，推荐。
- B 彩色分区：复用当前 Workspace Section 的彩色左边线。
- C 分类切换：项目组很多时减少纵向长度。
- 支持项目组折叠、仓库拖拽归组及管理菜单。

## 设计来源

- `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/`
- `designs/superset-design-system/ui_kits/desktop-app/WorkspaceSidebar.card.html`
- `designs/superset-design-system/`
