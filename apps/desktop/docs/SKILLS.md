# Skills library and Task capability boundaries

Updated: 2026-09-19. This describes the implemented scoped Skills UI and capability
refactoring, not a new autonomous workflow engine or an installed-app upgrade.

## UI and storage

Open Agent Context from the sidebar, then **Memory / MCP / Skills**. The existing
`/skills` route is reused rather than adding a second global settings page.

The scope picker shows Global and registered projects. Global files use
`SUPERSET_GLOBAL_SKILLS_DIR` when configured, otherwise `~/.agents/skills`. Project
files use `<registered project repoPath>/.agents/skills`. They are not automatically
copied into other worktrees. Native Pi also supports other configured locations
such as `.pi/skills`; those are not presented as editable locations in this slice.

The UI supports name/description search, create/edit/rename, Markdown preview,
complete-package copy between scopes, and explicitly confirmed package deletion.
Names and matching descriptions are returned in the list; full instructions and
companion-file inventories are requested for the selected skill only. Scripts and
reference/asset files can be previewed as text when suitable, but are read-only in
this UI; use an editor to change them. Preview never runs scripts or embeds remote
images. Raw HTML and JavaScript links are not executed.

A Skill is the entire directory containing `SKILL.md`, `references/`, `scripts/` and
assets. Rename preserves this directory; copy preserves file bytes, executable bits
and unknown frontmatter, and changes the copied name without overwriting another
package. Copying project material to Global is an explicit user action; review
private project details before doing it. The existing legacy global upsert API was
also fixed so rename no longer deletes companion files.

Save/copy/delete compare a hash of the whole loaded package, not just `SKILL.md`.
External changes in reference or script files cause a conflict, keep the draft,
and require reload/review rather than silently overwriting them. Unsaved changes
are guarded both when switching scopes/skills and when leaving via the app router;
browser unload also requests confirmation. No database or Skill registry is added.

## Discovery and limits

**Available for matching** is a resource-discovery preference, not confirmation
that a model has used it. **Explicit use only** writes Pi's
`disable-model-invocation: true`; it excludes the skill from automatic matching
metadata. It is not a security boundary or a guarantee that a file cannot be read.
Other ACP engines may interpret or support this field differently.

Pi continues to use its existing native DefaultResourceLoader. A configured Host
global skill directory is now passed as an additional native skill path. Trusted
project discovery and Pi's resource settings remain in effect. Editing a project
skill does not grant trust, restart an Agent, or hot-reload an active session.
New sessions or an explicit supported resource reload can discover changes.

Model-facing `list_global_skills` now returns only name, description and location;
`get_global_skill` reads one relevant body. This does not add a per-task classifier
or force a model call. The old settings.globalSkills API remains for compatibility;
the new UI uses authenticated settings.skills list/get/readFile/save/remove/copy.
Phone access is not newly granted. Native file read remains sufficient for project
skills; there is no second Skill execution protocol.

This editor manages direct `name/SKILL.md` packages whose metadata name matches the
directory. Invalid packages are listed as diagnostics rather than silently dropped.
Packages containing symbolic links, `.git`, special files, excessive nesting or
more than 16 MiB/512 files require external editing instead. Text preview and main
document sizes are bounded. These checks protect editor operations, not arbitrary
commands an agent may execute with user-provided privileges.

## What changed in Task Runtime

There is still one Task Runner and one principal Agent Session. The refactor adds
no Task phase, database table, additional model loop, or required Skill load.

- `tasks/checks/task-verification.ts`: selected approved check execution, real
  process records, failure details and eligible result reuse. It cannot change the
  Task's goal or declare success.
- `tasks/delivery/task-delivery-capability.ts`: narrow optional delivery interface.
  Git sequencing and actual side-effect reconciliation remain implemented in
  `delivery/git-delivery.ts` behind that interface.
- `tasks/task-composition.ts`: assembles existing concrete capabilities. The Runner
  no longer imports/constructs GitTaskDelivery or implements command execution itself.
- `tasks/task-runner.ts`: retains ownership, cancellation, requirement revisions,
  input invalidation, budgets, continuation and the final acceptance gate.

Task-specific approved checks remain explicit. Project-profile prompt content now
contains required instructions plus an ID/name check index, not every script and
path expression in every repair prompt. `get_task` supplies those details on demand.
Existing profile instructions are preserved, not automatically deleted/migrated.
The editor now explains that long methods belong in Skills and project facts in
Memory. No existing memories or user global skills were modified by this change.

The previously extracted project Skill `verify-behavior-change` remains an optional
method with its Superset reference file. This UI makes it visible under this project
and allows explicit whole-package copying; it does not install it globally by itself.
There is no new deployment integration, automatic memory write, Skill market,
mandatory reviewer, or parallel-agent phase.

## Validation commands

```sh
bun run --cwd packages/host-service test src/skills src/global-skills \
  src/tasks/task-skills.test.ts src/tasks/task-capabilities.test.ts
bun run --cwd packages/session-protocol test
bun run --cwd apps/desktop test \
  src/renderer/routes/_local/_dashboard/skills/components/GlobalSkillsPage/components/GlobalSkillEditor/GlobalSkillEditor.test.tsx

# Real isolated Electron route + actual HTTP Host and file operations. No model use.
SUPERSET_SKILLS_SMOKE=1 bun run --cwd apps/desktop scripts/task-runtime-smoke/run.ts
```

The Skills smoke reuses the existing isolated desktop harness. Actual Skills and
Agent Context tabs/router are mounted; host/catalog discovery and the destination
Memory/MCP page content are fixtures. It verifies scope selection, complete copy,
create/manual preference/rename, preview, unsaved navigation cancellation/approval,
external companion-file conflict, reload, explicit deletion, source retention and
page reload. It does not claim to test the full Memory or MCP page, packaged app
startup, or every third-party ACP engine. Test global directories and repositories
are disposable, not the user's real skill library. Captured reports/screenshots
are under the smoke's `.cache` directory. No real-model credentials or quota are
needed for Skills management.


## 本轮验证结果（2026-09-19）

- Host/Task/Skills/Pi/ACP/Git 与旧功能定向回归：266 项通过，0 失败，21 个测试文件。
- Session Protocol 全套：127 项通过，0 失败，13 个测试文件。
- Skills 编辑/预览与 Task 结果组件：9 项通过，0 失败，2 个测试文件。以上合计 402 项。
- Host、Shared、Session Protocol、Desktop 类型检查和 Host 声明生成通过；91 个累计变更源文件的定向 lint、仓库 Git 规则、git diff --check 通过。
- 真实隔离 Electron Skills 路径完成全局/项目切换、参考文件预览、整包复制、新建/仅显式使用/重命名、未保存导航取消与确认、外部参考文件冲突、重新读取、删除保留源包、刷新恢复。报告：apps/desktop/.cache/task-ui-smoke-1789825633184/report.json，附 5 张截图；rendererErrors 和 networkFailures 均为空，Task 数和模型请求数为 0。
- 拆分后重新运行原 Task 实际 Electron 交付路径，项目配置→指导→失败修复→真实检查→本地 Git 提交/临时远端推送→刷新恢复通过。报告：apps/desktop/.cache/task-ui-smoke-1789825786233/report.json；模型为本地模拟，不是本轮真实提供商验收。

没有新建业务数据库表、迁移用户运行数据库、重启已安装应用、写入用户真实全局技能/记忆或消耗真实模型额度。没有提交或推送 Superset 的源码改动。独立测试 Electron、Host、daemon、Vite 已关闭；报告及合成测试技能保留在 gitignored .cache。完整 installed-app 启动/升级和 mfcli 技能实际调用不在本轮验证声明内。
