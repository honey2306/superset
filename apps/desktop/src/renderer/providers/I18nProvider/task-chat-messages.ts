export const taskChatEnMessages = {
	"taskChat.modeChat": "Chat",
	"taskChat.modeTask": "Task",
	"taskChat.modeLabel": "Conversation mode",
	"taskChat.startHint":
		"Describe a goal here. Task mode uses this conversation and its model; no new window or session.",
	"taskChat.chatHint": "Message agent…",
	"taskChat.taskHint": "Describe the goal to complete autonomously…",
	"taskChat.guideHint": "Add guidance to this task…",
	"taskChat.resumeHint":
		"Explain what to do next — sending continues this task",
	"taskChat.unsupported":
		"Task mode requires a registered ACP runtime. Ordinary chat is unchanged.",
	"taskChat.waitIdle": "Finish the current turn before starting a task",
	"taskChat.status": "Task progress",
	"taskChat.overview": "Task overview",
	"taskChat.details": "Goal, checks and coverage",
	"taskChat.coverage": "Requirement coverage (reported by Agent)",
	"taskChat.noCoverage":
		"Coverage has not been reported; no verified completion inferred.",
	"taskChat.claimed":
		"A rationale is an Agent claim. Check results below are recorded by the Host.",
	"taskChat.criterionSatisfied": "Reported satisfied",
	"taskChat.criterionUnfinished": "Unfinished",
	"taskChat.criterionUnverified": "Unverified",
	"taskChat.continueCount": "Autonomous continuations: {count}",
	"taskChat.readOnlyDelivery":
		"Delivery is in progress. Use pause/cancel or delivery controls, not new coding messages.",
	"taskChat.guidance": "Guidance within current goal",
	"taskChat.constraint": "Add a requirement or restriction",
	"taskChat.backToChat": "Return to chat",
	"taskChat.accept": "I reviewed the result — accept",
	"taskChat.pause": "Pause",
	"taskChat.cancel": "Cancel task",
	"taskChat.resume": "Continue task",
	"taskChat.newTask": "New task in this chat",
	"taskChat.loadError":
		"Could not check this conversation’s task state. Retry before sending to avoid duplicate execution.",
	"taskChat.retry": "Retry",
	"taskChat.sameConversation": "Same conversation · edits and verification",
	"taskChat.attachments":
		"Please include text describing how these images relate to the task.",
	"taskChat.openChat": "Open conversation",
	"taskChat.budget":
		"Goal continuation budget reached; no further work was started.",
} as const;

export const taskChatZhMessages: Record<
	keyof typeof taskChatEnMessages,
	string
> = {
	"taskChat.modeChat": "对话",
	"taskChat.modeTask": "任务",
	"taskChat.modeLabel": "对话模式",
	"taskChat.startHint":
		"直接在这里描述目标。任务沿用当前聊天、模型和上下文，不另开窗口或会话。",
	"taskChat.chatHint": "与 Agent 聊天……",
	"taskChat.taskHint": "描述要自主完成的目标……",
	"taskChat.guideHint": "继续补充这项任务的要求……",
	"taskChat.resumeHint": "说明下一步做什么，发送后继续当前任务",
	"taskChat.unsupported":
		"当前会话需要使用已接入的 ACP 执行引擎，普通聊天不受影响。",
	"taskChat.waitIdle": "请等当前轮执行结束后再开启任务",
	"taskChat.status": "任务进度",
	"taskChat.overview": "任务总览",
	"taskChat.details": "目标、检查与覆盖",
	"taskChat.coverage": "要求覆盖（Agent 上报）",
	"taskChat.noCoverage": "尚未上报要求覆盖，不能据此认定完成。",
	"taskChat.claimed":
		"说明来自 Agent 的判断；下方检查结果由 Host 实际执行并记录。",
	"taskChat.criterionSatisfied": "上报已满足",
	"taskChat.criterionUnfinished": "尚未完成",
	"taskChat.criterionUnverified": "尚未验证",
	"taskChat.continueCount": "自主续跑：{count} 次",
	"taskChat.readOnlyDelivery":
		"正在交付，请使用暂停、取消或交付控制，不混入新的编码要求。",
	"taskChat.guidance": "现有目标内的指导",
	"taskChat.constraint": "追加要求或限制",
	"taskChat.backToChat": "返回普通聊天",
	"taskChat.accept": "我已核验，接受结果",
	"taskChat.pause": "暂停",
	"taskChat.cancel": "取消任务",
	"taskChat.resume": "继续任务",
	"taskChat.newTask": "在此聊天开启新任务",
	"taskChat.loadError":
		"无法核对当前聊天的任务状态，请重试后发送，避免重复执行。",
	"taskChat.retry": "重试",
	"taskChat.sameConversation": "当前聊天 · 修改与验证",
	"taskChat.attachments": "请补充文字，说明图片与当前任务的关系。",
	"taskChat.openChat": "回到聊天",
	"taskChat.budget": "已达到续跑预算，没有继续启动工作。",
};
