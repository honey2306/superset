export const skillEnMessages = {
	"skillsUi.profileBoundary":
		"Keep only acceptance constraints here. Put reusable methods in Skills and project facts in Memory; do not duplicate long runbooks in every task.",
	"skillsUi.title": "Skills",
	"skillsUi.subtitle":
		"Reusable methods, loaded only when relevant. Not another mandatory Task phase.",
	"skillsUi.global": "Global",
	"skillsUi.project": "Project",
	"skillsUi.scope": "Skill scope",
	"skillsUi.new": "New skill",
	"skillsUi.search": "Search skills…",
	"skillsUi.empty": "No skills in this scope",
	"skillsUi.noMatch": "No matching skills",
	"skillsUi.select": "Select a skill or create one",
	"skillsUi.loading": "Loading…",
	"skillsUi.refresh": "Reload from disk",
	"skillsUi.unavailable": "Local Host is unavailable",
	"skillsUi.name": "Skill name",
	"skillsUi.description": "When to use",
	"skillsUi.instructions": "Instructions",
	"skillsUi.descriptionPlaceholder":
		"Describe when this method is useful, and when it is not.",
	"skillsUi.instructionsPlaceholder":
		"# Method\n\nDescribe the smallest useful steps and reference existing tools.",
	"skillsUi.edit": "Edit",
	"skillsUi.preview": "Preview",
	"skillsUi.save": "Save skill",
	"skillsUi.saving": "Saving…",
	"skillsUi.saved": "Saved on disk",
	"skillsUi.unsaved": "Unsaved changes",
	"skillsUi.manual":
		"Explicit use only (exclude from automatic matching index)",
	"skillsUi.auto": "Available for matching",
	"skillsUi.manualTag": "Explicit only",
	"skillsUi.lifetime":
		"Saving changes files, not active sessions. New sessions or a supported reload discover updates; project trust and engine support still apply. Discovery does not guarantee invocation.",
	"skillsUi.locationHint":
		"Project skills are stored in the registered repository’s .agents/skills, not every worktree. Other Pi paths remain managed by Pi settings.",
	"skillsUi.scopeHint":
		"Global knowledge belongs in memory; repeatable methods belong here. Skills never grant publishing permissions or replace verification records.",
	"skillsUi.files": "Package files",
	"skillsUi.filesHint":
		"References, scripts and assets are preserved on rename and copied together. Previews never execute scripts.",
	"skillsUi.noFiles": "No companion files",
	"skillsUi.fileChanged":
		"The package changed since you opened it. Reload before editing or copying.",
	"skillsUi.copy": "Copy complete package",
	"skillsUi.copyTitle": "Copy skill package",
	"skillsUi.copyHint":
		"Copies SKILL.md plus all references, scripts and assets. Destination conflicts are rejected; source files stay unchanged. Review project-specific details before copying globally.",
	"skillsUi.copyTarget": "Destination scope",
	"skillsUi.copyName": "Destination name",
	"skillsUi.copyConfirm": "Copy package",
	"skillsUi.copied": "Complete package copied",
	"skillsUi.remove": "Delete skill",
	"skillsUi.removeTitle": "Delete the whole skill package?",
	"skillsUi.removeHint":
		"This deletes SKILL.md and every companion file in this package. It cannot unload content already read by an active session.",
	"skillsUi.cancel": "Cancel",
	"skillsUi.discard": "Discard changes",
	"skillsUi.discardTitle": "Discard unsaved changes?",
	"skillsUi.discardHint":
		"Your draft has not been saved. Reloading or switching will discard it.",
	"skillsUi.keep": "Keep editing",
	"skillsUi.errors": "Some packages could not be read",
	"skillsUi.path": "File location",
	"skillsUi.bodyOnDemand":
		"Only names and descriptions are listed; the body loads when selected.",
	"skillsUi.projectTrust":
		"Project discovery requires Pi project trust; managing files does not grant it.",
} as const;

export const skillZhMessages: Record<keyof typeof skillEnMessages, string> = {
	"skillsUi.profileBoundary":
		"这里仅保留验收约束。可复用方法放技能，项目事实放记忆，不把长操作手册重复注入每个任务。",
	"skillsUi.title": "技能",
	"skillsUi.subtitle": "可复用的方法，相关时按需加载，不是新的 Task 必经阶段。",
	"skillsUi.global": "全局",
	"skillsUi.project": "项目",
	"skillsUi.scope": "技能范围",
	"skillsUi.new": "新建技能",
	"skillsUi.search": "搜索技能……",
	"skillsUi.empty": "此范围还没有技能",
	"skillsUi.noMatch": "没有匹配的技能",
	"skillsUi.select": "选择技能或新建",
	"skillsUi.loading": "正在加载……",
	"skillsUi.refresh": "从磁盘重新读取",
	"skillsUi.unavailable": "本地主机服务不可用",
	"skillsUi.name": "技能名称",
	"skillsUi.description": "适用场景",
	"skillsUi.instructions": "方法正文",
	"skillsUi.descriptionPlaceholder":
		"说明这种方法适用于什么任务，哪些情况不必使用。",
	"skillsUi.instructionsPlaceholder":
		"# 方法\n\n描述最小必要步骤，引用已有工具。",
	"skillsUi.edit": "编辑",
	"skillsUi.preview": "预览",
	"skillsUi.save": "保存技能",
	"skillsUi.saving": "正在保存……",
	"skillsUi.saved": "已保存到磁盘",
	"skillsUi.unsaved": "有未保存修改",
	"skillsUi.manual": "仅显式使用（不进入自动匹配索引）",
	"skillsUi.auto": "可供按需匹配",
	"skillsUi.manualTag": "仅显式使用",
	"skillsUi.lifetime":
		"保存只更新文件，不修改活动会话。新会话或支持的重新加载会发现更新，仍受项目信任和引擎能力约束；发现不等于一定调用。",
	"skillsUi.locationHint":
		"项目技能写入已登记仓库的 .agents/skills，不会复制到每个工作区。其他 Pi 技能路径仍由 Pi 设置管理。",
	"skillsUi.scopeHint":
		"事实与经验放记忆，可复用方法放技能。技能不授予发布权限，也不能替代验证记录。",
	"skillsUi.files": "技能包文件",
	"skillsUi.filesHint":
		"重命名保留、复制时带上参考资料、脚本和资源；预览不会执行脚本。",
	"skillsUi.noFiles": "没有附带文件",
	"skillsUi.fileChanged": "技能包已在打开后变化，请重新读取再修改或复制。",
	"skillsUi.copy": "复制完整技能包",
	"skillsUi.copyTitle": "复制技能包",
	"skillsUi.copyHint":
		"复制 SKILL.md 及所有参考资料、脚本和资源。不覆盖目标同名技能，也不修改源文件。复制到全局前请检查项目私有内容。",
	"skillsUi.copyTarget": "目标范围",
	"skillsUi.copyName": "目标名称",
	"skillsUi.copyConfirm": "确认复制",
	"skillsUi.copied": "已复制完整技能包",
	"skillsUi.remove": "删除技能",
	"skillsUi.removeTitle": "删除整个技能包？",
	"skillsUi.removeHint":
		"将删除 SKILL.md 及此技能包的全部附带文件。无法从已读取它的活动会话中撤回内容。",
	"skillsUi.cancel": "取消",
	"skillsUi.discard": "放弃修改",
	"skillsUi.discardTitle": "放弃未保存的修改？",
	"skillsUi.discardHint": "草稿尚未保存，重新读取或切换将丢弃这些修改。",
	"skillsUi.keep": "继续编辑",
	"skillsUi.errors": "部分技能包无法读取",
	"skillsUi.path": "文件位置",
	"skillsUi.bodyOnDemand": "列表仅返回名称和描述，选择后才读取正文。",
	"skillsUi.projectTrust":
		"Pi 发现项目技能需要项目信任；管理文件不会自动授予信任。",
};
