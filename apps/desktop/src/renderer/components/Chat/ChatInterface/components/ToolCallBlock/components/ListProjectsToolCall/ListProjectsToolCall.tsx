import { FolderKanbanIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListProjectsToolCallProps {
	part: ToolPart;
}

export function ListProjectsToolCall({ part }: ListProjectsToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.listProjects")}
			icon={FolderKanbanIcon}
		/>
	);
}
