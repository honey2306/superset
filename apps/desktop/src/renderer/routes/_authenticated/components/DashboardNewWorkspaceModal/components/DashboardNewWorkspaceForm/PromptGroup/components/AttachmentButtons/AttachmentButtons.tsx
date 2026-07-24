import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PaperclipIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PILL_BUTTON_CLASS } from "../../types";

interface AttachmentButtonsProps {
	linearIssueTrigger: ReactNode;
	githubIssueTrigger: ReactNode;
	prTrigger: ReactNode;
}

export function AttachmentButtons({
	linearIssueTrigger,
	githubIssueTrigger,
	prTrigger,
}: AttachmentButtonsProps) {
	const { t } = useTranslation();
	const attachments = usePromptInputAttachments();
	return (
		<div className="flex items-center gap-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						aria-label={t("workspace.addAttachment")}
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						onClick={() => attachments.openFileDialog()}
					>
						<PaperclipIcon className="size-3.5" />
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{t("workspace.addAttachment")}
				</TooltipContent>
			</Tooltip>
			{linearIssueTrigger}
			{githubIssueTrigger}
			{prTrigger}
		</div>
	);
}
