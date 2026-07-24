import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { useTranslation } from "renderer/providers/I18nProvider";

export function ThinkingMessage() {
	const { t } = useTranslation();
	return (
		<Message from="assistant">
			<MessageContent>
				<ShimmerLabel className="text-sm text-muted-foreground">
					{t("chat.thinkingEllipsis")}
				</ShimmerLabel>
			</MessageContent>
		</Message>
	);
}
