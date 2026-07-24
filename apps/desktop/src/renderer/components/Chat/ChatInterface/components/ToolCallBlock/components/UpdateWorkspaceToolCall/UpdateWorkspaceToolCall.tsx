import { PencilLineIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface UpdateWorkspaceToolCallProps {
	part: ToolPart;
}

export function UpdateWorkspaceToolCall({
	part,
}: UpdateWorkspaceToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.updateWorkspace")}
			icon={PencilLineIcon}
		/>
	);
}
