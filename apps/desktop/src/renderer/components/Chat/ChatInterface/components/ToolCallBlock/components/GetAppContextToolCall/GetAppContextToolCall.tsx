import { AppWindowIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface GetAppContextToolCallProps {
	part: ToolPart;
}

export function GetAppContextToolCall({ part }: GetAppContextToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.getAppContext")}
			icon={AppWindowIcon}
		/>
	);
}
