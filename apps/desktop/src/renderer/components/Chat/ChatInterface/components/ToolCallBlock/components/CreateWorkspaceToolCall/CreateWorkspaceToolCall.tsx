import { FolderPlusIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface CreateWorkspaceToolCallProps {
	part: ToolPart;
}

export function CreateWorkspaceToolCall({
	part,
}: CreateWorkspaceToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.createWorkspace")}
			icon={FolderPlusIcon}
		/>
	);
}
