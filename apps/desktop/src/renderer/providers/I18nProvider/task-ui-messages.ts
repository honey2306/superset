export const taskUiEnMessages = {
	"taskUi.subtitle":
		"Goals from your conversations. Progress, evidence and delivery in one place.",
	"taskUi.emptyTitle": "Start with a conversation",
	"taskUi.emptyBody":
		"Discuss the approach with your agent, switch to Task, and send the goal. Keep the same context and follow its progress here.",
	"taskUi.openWorkspace": "Go to conversations",
	"taskUi.advancedCreate": "Advanced task",
	"taskUi.emptyStepChat": "Discuss the goal",
	"taskUi.emptyStepRun": "Work autonomously",
	"taskUi.emptyStepVerify": "Review real results",
	"taskUi.noMatches": "No matching tasks",
	"taskUi.clearFilters": "Clear filters",
	"taskUi.listLabel": "Tasks",
	"taskUi.detailsLabel": "Task details",
	"taskUi.backToList": "Back to tasks",
	"taskUi.runtimeDetails": "Execution settings",
	"taskUi.progress": "Progress",
	"taskUi.more": "More task actions",
	"taskUi.viewDetails": "View task details",
	"taskUi.hideDetails": "Collapse task details",
	"taskUi.keepRunning":
		"Tasks continue while the desktop is running. Closing this page does not stop them.",
	"taskUi.allEngines":
		"Uses the same ACP agents as conversations. Login and runtime capabilities still apply.",
	"taskUi.autoGuide":
		"Live guidance when supported; otherwise queued for the same conversation.",
	"taskUi.executionFacts": "Execution details",
	"taskUi.resultsHint": "Agent reports and actual checks are shown separately.",
	"taskUi.working": "The agent is working in your conversation",
	"taskUi.workingHint":
		"Open the conversation to follow tool activity or add context. Checks and results appear here as they arrive.",
} as const;

export const taskUiZhMessages: Record<keyof typeof taskUiEnMessages, string> = {
	"taskUi.subtitle": "从对话发起目标，在这里查看进展、验证与交付。",
	"taskUi.emptyTitle": "让任务从对话开始",
	"taskUi.emptyBody":
		"和 Agent 讨论清楚后，在输入框切换「任务」并发送目标。上下文不变，执行进展会汇总到这里。",
	"taskUi.openWorkspace": "前往聊天",
	"taskUi.advancedCreate": "高级创建",
	"taskUi.emptyStepChat": "讨论目标",
	"taskUi.emptyStepRun": "自主执行",
	"taskUi.emptyStepVerify": "核验结果",
	"taskUi.noMatches": "没有匹配的任务",
	"taskUi.clearFilters": "清除筛选",
	"taskUi.listLabel": "任务列表",
	"taskUi.detailsLabel": "任务详情",
	"taskUi.backToList": "返回任务列表",
	"taskUi.runtimeDetails": "执行设置",
	"taskUi.progress": "执行进展",
	"taskUi.more": "更多任务操作",
	"taskUi.viewDetails": "查看任务详情",
	"taskUi.hideDetails": "收起任务详情",
	"taskUi.keepRunning": "保持桌面应用运行即可持续执行，关闭此页不会停止任务。",
	"taskUi.allEngines":
		"复用聊天中已接入的 ACP Agent，沿用各自登录方式与运行能力。",
	"taskUi.autoGuide": "支持时实时指导，否则排队交给同一会话。",
	"taskUi.executionFacts": "执行信息",
	"taskUi.resultsHint": "Agent 上报与实际检查结果分别展示。",
	"taskUi.working": "Agent 正在原对话中执行",
	"taskUi.workingHint":
		"回到聊天查看工具执行或补充上下文，检查与结果会持续更新到这里。",
};
