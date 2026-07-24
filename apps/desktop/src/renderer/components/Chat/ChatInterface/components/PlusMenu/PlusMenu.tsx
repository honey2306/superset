import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniPaperClip } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PILL_BUTTON_CLASS } from "../../styles";

export function PlusMenu() {
	const { t } = useTranslation();
	const attachments = usePromptInputAttachments();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<PromptInputButton
					aria-label={t("plusMenu.addAttachment")}
					className={`${PILL_BUTTON_CLASS} w-[23px]`}
					onClick={() => attachments.openFileDialog()}
				>
					<HiMiniPaperClip className="size-3.5" />
				</PromptInputButton>
			</TooltipTrigger>
			<TooltipContent side="top">{t("plusMenu.addAttachment")}</TooltipContent>
		</Tooltip>
	);
}
