# Superset Design System

**Dracula-only, dark-forward** language for Superset(内部工具:Electron/Next.js/Neon/tRPC + Bun monorepo)。抽取自 `designs/branch-menu-redesign/` v3 —— B 版 popover + 右键菜单聚合操作那一版。

粉色是品牌色,但只做 tint / dot / ring / focus / current-item background;主体色永远交给中性色(Dracula 的 `#282a36` / `#f8f8f2` / `#44475a` 家族)。这是这套系统最重要的一条视觉判断,所有组件都尊重它。

## Sources

- `designs/branch-menu-redesign/Branch Menu v3.html` —— 视觉与交互的直接来源
- `apps/desktop/src/renderer/screens/main/` —— 真实产品主界面结构对照(WorkspaceSidebar / ChatInterface / Changes 面板)
- `packages/ui/src/components/ui/` —— shadcn/ui 组件命名对照(Button / Input / Tabs / Popover 等)

## Content Fundamentals

- **书面语中英夹杂**:UI 主体中文,产品名词 / 品牌 / 代码相关(branch / commit / push / fetch)保留英文;避免"分支菜单" ↔ "Branch menu" 反复横跳,单个组件内保持一致。
- **动词是命令句**:"删除分支" / "切换到此分支" / "从此分支新建…";省略号(`…`)只在这个动作会展开二级面板时使用。
- **禁用项的解释在 tooltip 里**:"无法合并到自身" / "已在此分支" / "不能删除当前分支";不占屏。
- **数字用等宽字体呈现**:ahead/behind、file counts、时间戳,一律 `--font-mono`,让眼睛能顺着列扫。
- **Toast 简短过去时**:「已切换到 feat/kro-suite」/「已推送 3 commits」;避免"成功地" / "尝试"这类冗词。
- **代码 inline 用 `<code>`**:分支名 / 文件路径 / 变量 / 命令,统一 mono + `--hover` 底色。
- **无 emoji**:除非用户自己 commit message 里带,系统 UI 永远不出 emoji。

## Visual Foundations

### Colors
- **调色板** 基于 Dracula:`#282a36` 深底、`#f8f8f2` 文字、`#ff79c6` 品牌粉、`#bd93f9` 强调紫。语义 token 全部走 `color-mix(in oklch, ...)` 派生。
- **粉色是 tint、不是 fill**:唯一"填充粉色"的地方是 pill primary button 的 `background: color-mix(#fff 90%, --accent)` 那一层文字,以及 focus ring。其他所有粉色都是 12–15% 的 `--accent-tint`。
- **状态**:success/warning/danger 只在 tag / badge / dot / danger button 上出现,永远不做大面积色块。

### Type
- **UI**:`-apple-system, "SF Pro Text", "PingFang SC"`(CJK 混排)
- **Mono**:`"SF Mono", "JetBrains Mono"`;所有分支名 / 文件路径 / kbd / 数字用 mono。
- **Display 28px** 只在页头标题;body 13px + line-height 1.55;captions 10.5–11px。

### Space
- **4-based**,常用 2 / 6 / 10 半步。行高:tabs 34px、rows 30–34px、input 26–30px、button 24 / 28px。桌面 UI 的天花板密度。

### Radius
- Rows 6px、cards 12–14px、pills 999px。触发器、按钮、chip、tag 一律 pill;卡片、popover、menu 一律 12–14。

### Backgrounds
- 无背景图、无 gradient(除了 pill primary 的 `color-mix` fill)、无 texture。分层靠 `--page-bg` < `--surface` < `--surface-elev` < `--surface-sunk` 四档。

### Animation
- **仅存在 3 处**:popover 入场 (180ms · standard)、context menu 入场 (140ms · standard)、toast 入场 (220ms · standard)。其他 hover / focus 用 120ms 过渡,无 bounce。`prefers-reduced-motion` 时全部 → 0。

### Hover / Press
- **Hover** 加 `--hover`(白 6%)背景 + 主色回到 `--fg`;不加 border。
- **Press** 不缩放。primary button press 用更深的 tint。
- **Focus** 用 `--glow-accent`(2px 粉色发光 ring),永不用浏览器默认蓝色。

### Border / Shadow
- **Borders** 都是 hairline(1px),分 `--line`(10% fg)/ `--line-strong`(18%)两级。
- **Shadow** 4 级,`--shadow-3` 是 popover / menu / confirm 的默认;避免 shadow 撞进内容。

### Transparency & Blur
- 只有 context menu 用了 `backdrop-filter: blur(6px)`,别的都不用。

## Iconography

- **自己的一套 line-icon**,23 个,`Icon` 组件按 `name` 分发。24-viewbox、stroke=currentColor、strokeWidth 1.7、strokeLinecap round。全部同款质感,不混用其他 icon set。
- 图标名:`branch, chevron, search, plus, check, refresh, push, pull, merge, arrowRight, edit, copy, terminal, trash, alert, file, cloud, changes, max, x, sort, moreH, spark`。
- **Emoji / Unicode 图标不使用**;唯一例外是 popover row 里的 `↑ 3 / ↓ 12` —— 这是"就是要它是符号"的 ahead/behind 语义。
- 尺寸约定:12px(mono 行内 tag / row glyph)、13px(menu item / input glyph)、14px(chip / toast / status bar 默认)、16px(confirm card / message avatar 内)。

如果需要更丰富的 icon(不到 20 个够用),再补 `Icon.jsx` 里的 `P` 表;不要引入 CDN icon 库。

## Index

- `readme.md` — 你正在读的这一份
- `SKILL.md` — 让其他 designs 项目 / agent 找到并加载这套系统
- `styles.css` — global 入口(仅 `@import` 行)
- `components.css` — 所有组件的样式
- `app.css` — 完整 App Shell 用到的 layout 样式(不做组件,只做整合 UI kit 用的)
- `tokens/` — 10 个 token 文件(colors / typography / spacing / radius / shadow / motion / z-index / opacity / border-width / focus)+ reset
- `foundations/` — 7 张 foundation @dsCard 卡片
- `components/` — 53 个组件(含 sub-exports),按 core / forms / feedback / overlays / navigation / data 六组分类;每个组件一张 `.card.html`
- `patterns/` — 7 个多组件复合模式(EmptyState 作为 primitive 另计):ErrorState / SkeletonList / FormField / SectionHeader / ListHeader / KeyboardHintBar / ToastStack
- `layouts/` — 4 个页级布局:AppShell / DoubleSidebar / TabbedWorkspace / ModalStack
- `ui_kits/desktop-app/` — 完整 App Shell + Chat / WorkspaceSidebar / CommandPalette / NewWorkspaceModal / Paywall / UpdatesPill 共 7 张卡
- `Design System.html` — 手工整合的预览页(备用,`preview.html` 由 build-preview 生成)
- `App Shell.html` — 完整应用页面的备用入口

Starting points 现有 11 个 —— 覆盖模态族(ConfirmCard / AlertDialog / Dialog / Popover / ContextMenu / DropdownMenu / Sheet)、EmptyState pattern,以及 3 个完整屏(desktop-app 主视图、WorkspaceSidebar、CommandPalette)。消费方可以直接以这几处高价值场景作为设计起点。

## Decision guide

一份"该用哪一件"的速查表。所有条目遵守四条契约:pink stays a tint、mono everywhere numbers appear、no hover-only inline actions、hairline everything。

### Overlays — 该开哪种模态

| 场景 | 组件 | 为什么 |
|---|---|---|
| 一句话确认(删除、切换) | `ConfirmCard` | 就地锚定,少打扰;`AlertDialog` 全屏 scrim 太重 |
| 破坏性且无处锚定(批量删除、退出登录) | `AlertDialog` | 全屏 scrim + 危险按钮,必须 explicit |
| 多字段表单(New workspace、Settings 子面板) | `Dialog` | 中央模态,有 header + footer 结构 |
| 详细视图但不该抢焦(PR 详情、Task 详情) | `Sheet` | 侧滑,主区仍可见 |
| 右键触发的次级动作 | `ContextMenu` | v3 的核心,禁 hover-only 内联操作 |
| 点击按钮弹出的动作组 | `DropdownMenu` | 与 ContextMenu 同密度,不同触发方式 |
| 富信息 hover 预览(PR 卡片、user 卡片) | `HoverCard` | 300ms 延迟,防误触 |
| 一句话事实标签(disabled 说明、快捷键提示) | `Tooltip` | 即时显示 |
| 键盘驱动的搜索(⌘K、branch 切换) | `Popover` | 与 ContextMenu 视觉一致但含 header + hint bar |

### 输入 — 该用哪一种

| 场景 | 组件 |
|---|---|
| 单行文本 | `Input` (hairline + focus glow) |
| 多行文本 | `Textarea` |
| 二选一或多选一(3 项以内) | `SegmentedControl` |
| 二选一或多选一(4 项及以上) | `Radio` group |
| 多选(彼此独立) | `Checkbox` |
| 开关(立即生效的布尔) | `Switch` |
| 数值滑动(0–N,连续) | `Slider` |
| 从大集合选一个 | `Popover` 搜索式,不用 `Select` |

### 状态反馈 — 该用哪一种

| 场景 | 组件 |
|---|---|
| 已完成的动作反馈 | `Toast` (past tense) |
| 持续存在的条件(未提交更改、更新可用) | `Alert` |
| 破坏性动作前确认 | `ConfirmCard` 或 `AlertDialog` |
| 加载中(可确定终点) | `Progress` |
| 加载中(不确定终点) | `Spinner` |
| 数据到来前的占位 | `SkeletonList` |
| 数据永远不会到来 | `Empty` |
| 数据请求失败 | `ErrorState` pattern |
| 字段级校验失败 | `FormField` pattern (error slot) |

### 布局 — 该套哪一层

| 场景 | 布局 |
|---|---|
| 全应用外壳 | `AppShell` (chrome 34 + main 1fr + status 24) |
| 主工作区 | `DoubleSidebar` (rail 44 + sidebar 260–320 + main) |
| 有 tab 的多面板视图 | `TabbedWorkspace` |
| 决定哪个 overlay 覆盖哪个 | `ModalStack` z-index ladder |

## Roadmap

现在只做 Dracula 主题。tokens 已经预留了主题切换空间(所有语义 token 都是从 `--dracula-*` 派生),后续加 Light / Ember / Zed 只需要复制 `tokens/colors.css` 的整块 :root,加 `[data-theme="..."]` 前缀,不用改任何组件代码。

### Components recap

Core: `Badge / Button / Chip / Divider / Icon / IconButton / Kbd / Pill / Tag`
Forms: `Checkbox / Input / Label / Radio / SegmentedControl / Slider / Switch / Textarea`
Feedback: `Alert / ConfirmCard / Empty / Progress / Skeleton / Spinner / Toast`
Navigation: `Breadcrumb / Collapsible / FileRow / Tabs / WorkspaceItem`
Overlays: `AlertDialog / ContextMenu`(+ MenuHeading/Sep/Group/Item)、`Dialog`(+ Header/Footer)、`DropdownMenu / HoverCard / Popover`(+ Header/Group/Row/Sep/Hint)、`Sheet / Tooltip`
Data: `Avatar / ScrollArea / Table`(+ THead/TBody/TR/TH/TD)

## Regenerate

每次改完组件 / tokens / 卡片,顺序跑:

```
node <baoyu-design skill>/agents/compile-design-system.mjs designs/superset-design-system
node <baoyu-design skill>/agents/check-design-system.mjs designs/superset-design-system
node <baoyu-design skill>/agents/build-preview.mjs designs/superset-design-system
```

第一步生成 `_ds_bundle.js` / `_ds_manifest.json` / `_adherence.oxlintrc.json`;第二步只读校验,应输出 `No issues — clean.`;第三步产出 436KB 左右的自包含 `preview.html`。
