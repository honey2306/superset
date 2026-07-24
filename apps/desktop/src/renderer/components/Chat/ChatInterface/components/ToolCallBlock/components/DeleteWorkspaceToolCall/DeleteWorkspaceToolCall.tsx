import { Trash2Icon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface DeleteWorkspaceToolCallProps {
	part: ToolPart;
}

export function DeleteWorkspaceToolCall({
	part,
}: DeleteWorkspaceToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.deleteWorkspace")}
			icon={Trash2Icon}
		/>
	);
}
