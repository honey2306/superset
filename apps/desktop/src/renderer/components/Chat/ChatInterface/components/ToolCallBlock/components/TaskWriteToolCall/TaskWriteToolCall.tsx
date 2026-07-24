import { ListTodoIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getArgs } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface TodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed";
	priority?: string;
}

function toTodoItems(value: unknown): TodoItem[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is TodoItem =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as TodoItem).content === "string",
	);
}

function buildDescription(
	todos: TodoItem[],
	t: (
		key:
			| "chat.tool.taskCount"
			| "chat.tool.inProgressCount"
			| "chat.tool.completedCount"
			| "chat.tool.pendingCount",
		values?: Record<string, number | string>,
	) => string,
): string | undefined {
	if (todos.length === 0) return undefined;

	const inProgress = todos.filter(
		(item) => item.status === "in_progress",
	).length;
	const completed = todos.filter((item) => item.status === "completed").length;
	const pending = todos.filter((item) => item.status === "pending").length;

	const parts: string[] = [t("chat.tool.taskCount", { count: todos.length })];
	const statusParts: string[] = [];
	if (inProgress > 0)
		statusParts.push(t("chat.tool.inProgressCount", { count: inProgress }));
	if (completed > 0)
		statusParts.push(t("chat.tool.completedCount", { count: completed }));
	if (pending > 0)
		statusParts.push(t("chat.tool.pendingCount", { count: pending }));
	if (statusParts.length > 0) parts.push(statusParts.join(" · "));

	return parts.join(" · ");
}

interface TaskWriteToolCallProps {
	part: ToolPart;
}

export function TaskWriteToolCall({ part }: TaskWriteToolCallProps) {
	const { t } = useTranslation();
	const args = getArgs(part);
	const todos = toTodoItems(args.todos);
	const description = buildDescription(todos, t);

	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.updateTasks")}
			icon={ListTodoIcon}
			subtitle={description}
		/>
	);
}
