import { InfoIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface GetWorkspaceDetailsToolCallProps {
	part: ToolPart;
}

export function GetWorkspaceDetailsToolCall({
	part,
}: GetWorkspaceDetailsToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.getWorkspaceDetails")}
			icon={InfoIcon}
		/>
	);
}
