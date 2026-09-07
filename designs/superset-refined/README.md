# Superset refined UI prototype

这是 Superset 桌面工作区的独立 HTML 设计稿，使用本地 HTML、CSS、JavaScript 和仓库内的 logo 资源构建，不依赖远程包或生产代码。

## 设计方向

- 以温和石墨为默认主题，保留一层低饱和 sage 作为运行状态和操作反馈色；同时提供 Warm paper、Muted plum 两个主题，用于快速比较整体气质。
- 左侧导航减少横向分割线，用层级、留白和选中底色组织项目与会话；中间区域把 agent 状态、模型设置、对话和 composer 收进同一条阅读路径。
- 右侧变更预览只保留当前审阅真正需要的内容：目录与文件名分开显示，长路径不会撑开面板；专注模式可以临时收起两侧。
- 正文使用更舒展的 15px 阅读字号，工具文本保持 10–13px 的紧凑密度，避免整体像仪表盘或营销页面。

## 可交互示例

- 顶部主题切换会即时替换整套颜色 token，并在本地浏览器中记住选择。
- 左侧“工作区 / 自动化 / 待办 / 项目记忆”会切换同一外壳中的不同内容视图。
- 项目组可以折叠；会话标签、右侧文件列表、工具栏标签均可切换。
- “收起变更预览”和“专注模式”会调整工作区列；待办复选框、记忆搜索框、composer 发送和 Enter 快捷键均有本地演示状态。
- 右侧文件选择会更新父级目录、文件名、改动统计和示例 diff。

预览地址：http://localhost:4311/superset-refined/index.html 。这是独立设计稿，发送消息、终端输出、创建操作均为本地示例，不连接真实 Agent 或 Host 服务。其余入口以提示说明未接入业务。

设计参考：apps/desktop/src/renderer/globals.css、WorkspaceSidebar/WorkspaceSidebar.tsx、AcpSessionPane/acp-pane.css 及当前运行的桌面 App。

主线程验收：1290×800 预览；配色切换、文件差异、专注模式通过实际浏览器点击检查。
