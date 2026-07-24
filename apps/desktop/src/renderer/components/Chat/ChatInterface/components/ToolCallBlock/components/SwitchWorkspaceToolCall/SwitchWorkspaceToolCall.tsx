import { ArrowRightLeftIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface SwitchWorkspaceToolCallProps {
	part: ToolPart;
}

export function SwitchWorkspaceToolCall({
	part,
}: SwitchWorkspaceToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.switchWorkspace")}
			icon={ArrowRightLeftIcon}
		/>
	);
}
