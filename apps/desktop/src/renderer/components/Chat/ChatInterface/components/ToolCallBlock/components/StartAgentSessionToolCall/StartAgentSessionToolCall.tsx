import { BotIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface StartAgentSessionToolCallProps {
	part: ToolPart;
	toolName?: string;
}

export function StartAgentSessionToolCall({
	part,
	toolName,
}: StartAgentSessionToolCallProps) {
	const { t } = useTranslation();
	const resolvedToolName = toolName ?? t("chat.tool.startAgentSession");
	return (
		<SupersetToolCall part={part} toolName={resolvedToolName} icon={BotIcon} />
	);
}
