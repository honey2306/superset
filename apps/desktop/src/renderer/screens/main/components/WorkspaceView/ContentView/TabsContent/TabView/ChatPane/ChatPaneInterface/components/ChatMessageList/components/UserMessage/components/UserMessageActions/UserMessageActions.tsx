import {
	MessageAction,
	MessageActions,
} from "@superset/ui/ai-elements/message";
import {
	CheckIcon,
	CopyIcon,
	PencilLineIcon,
	RotateCcwIcon,
} from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";

interface UserMessageActionsProps {
	actionDisabled: boolean;
	copied: boolean;
	fullText: string;
	onCopy: () => void;
	onEdit: () => void;
	onResend: () => void;
}

export function UserMessageActions({
	actionDisabled,
	copied,
	fullText,
	onCopy,
	onEdit,
	onResend,
}: UserMessageActionsProps) {
	const { t } = useTranslation();
	return (
		<div className="opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
			<MessageActions className="rounded-lg bg-background/95 p-1 shadow-sm backdrop-blur-xs">
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label={t("chat.userMessage.resend")}
					onClick={onResend}
					tooltip={t("chat.userMessage.resendTooltip")}
					disabled={actionDisabled}
				>
					<RotateCcwIcon className="size-3.5" />
				</MessageAction>
				<MessageAction
					className="size-7 text-muted-foreground hover:text-foreground"
					label={t("chat.userMessage.edit")}
					onClick={onEdit}
					tooltip={t("chat.userMessage.editTooltip")}
					disabled={actionDisabled}
				>
					<PencilLineIcon className="size-3.5" />
				</MessageAction>
				{fullText ? (
					<MessageAction
						className="size-7 text-muted-foreground hover:text-foreground"
						label={
							copied ? t("chat.userMessage.copied") : t("chat.userMessage.copy")
						}
						onClick={onCopy}
						tooltip={
							copied
								? t("chat.userMessage.copied")
								: t("chat.userMessage.copyTooltip")
						}
					>
						{copied ? (
							<CheckIcon className="size-3.5" />
						) : (
							<CopyIcon className="size-3.5" />
						)}
					</MessageAction>
				) : null}
			</MessageActions>
		</div>
	);
}
