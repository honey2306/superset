import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	ChevronDown,
	MessageSquare,
	SlidersHorizontal,
	Target,
} from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ConversationTaskController } from "../../hooks/useConversationTask";
export function ConversationTaskMode({
	task,
}: {
	task: ConversationTaskController;
}) {
	const { t } = useTranslation();
	if (!task.supported && !task.active) return null;
	return (
		<span className="acp-task-mode" data-testid="conversation-task-mode">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="acp-task-mode__trigger"
						data-active={task.taskMode}
						aria-label={t("taskChat.modeLabel")}
						disabled={!task.canChooseMode}
						title={
							task.canChooseMode
								? t("taskChat.startHint")
								: t("taskChat.waitIdle")
						}
					>
						{task.taskMode ? (
							<Target aria-hidden />
						) : (
							<MessageSquare aria-hidden />
						)}
						{t(task.taskMode ? "taskChat.modeTask" : "taskChat.modeChat")}
						<ChevronDown className="acp-task-mode__chevron" aria-hidden />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" side="top" sideOffset={8}>
					<DropdownMenuRadioGroup
						value={task.taskMode ? "task" : "chat"}
						onValueChange={(value) => task.chooseMode(value === "task")}
					>
						<DropdownMenuRadioItem value="chat">
							<MessageSquare className="mr-2 size-3.5" />
							{t("taskChat.modeChat")}
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="task">
							<Target className="mr-2 size-3.5" />
							{t("taskChat.modeTask")}
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{task.active ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="acp-task-mode__guidance"
							aria-label={t("agentTasks.guidanceKind")}
							title={t(
								task.kind === "constraint"
									? "taskChat.constraint"
									: "taskChat.guidance",
							)}
							disabled={task.busy || task.blocked}
						>
							<SlidersHorizontal aria-hidden />
							<span className="acp-task-mode__label">
								{t(
									task.kind === "constraint"
										? "taskChat.constraint"
										: "taskChat.guidance",
								)}
							</span>
							<ChevronDown aria-hidden />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="top" sideOffset={8}>
						<DropdownMenuRadioGroup
							value={task.kind}
							onValueChange={(value) =>
								task.setKind(value === "constraint" ? "constraint" : "guidance")
							}
						>
							<DropdownMenuRadioItem value="guidance">
								{t("taskChat.guidance")}
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="constraint">
								{t("taskChat.constraint")}
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</span>
	);
}
