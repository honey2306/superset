import { MonitorSmartphoneIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { SupersetToolCall } from "../SupersetToolCall";

interface ListDevicesToolCallProps {
	part: ToolPart;
}

export function ListDevicesToolCall({ part }: ListDevicesToolCallProps) {
	const { t } = useTranslation();
	return (
		<SupersetToolCall
			part={part}
			toolName={t("chat.tool.listDevices")}
			icon={MonitorSmartphoneIcon}
		/>
	);
}
