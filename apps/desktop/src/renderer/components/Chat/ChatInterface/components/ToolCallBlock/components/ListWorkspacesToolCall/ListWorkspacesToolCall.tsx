import { FolderTreeIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListWorkspacesToolCallProps {
	part: ToolPart;
}

export function ListWorkspacesToolCall({ part }: ListWorkspacesToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.listWorkspaces")}
			icon={FolderTreeIcon}
		/>
	);
}
