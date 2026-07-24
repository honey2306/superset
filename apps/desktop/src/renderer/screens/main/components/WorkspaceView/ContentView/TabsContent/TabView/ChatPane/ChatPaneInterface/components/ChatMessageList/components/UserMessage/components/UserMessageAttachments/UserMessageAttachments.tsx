import { useTranslation } from "renderer/providers/I18nProvider";
import { AttachmentChip } from "../../../AttachmentChip";
import type { ChatMessage, ChatMessagePart } from "../../types";

interface UserMessageAttachmentsProps {
	message: ChatMessage;
	onOpenAttachment: (url: string, filename?: string) => void;
}

export function UserMessageAttachments({
	message,
	onOpenAttachment,
}: UserMessageAttachmentsProps) {
	const { t } = useTranslation();
	return (
		<div className="flex max-w-[85%] flex-wrap justify-end gap-2">
			{message.content.map((part: ChatMessagePart, partIndex: number) => {
				const rawPart = part as {
					data?: string;
					filename?: string;
					mediaType?: string;
					mimeType?: string;
					type?: string;
				};
				if (part.type !== "image" && rawPart.type !== "file") {
					return null;
				}

				const data = rawPart.data ?? "";
				const mediaType =
					rawPart.mediaType ?? rawPart.mimeType ?? "application/octet-stream";
				if (!data) {
					return null;
				}

				if (part.type === "image" && "mimeType" in part && !rawPart.mediaType) {
					return (
						<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
							<img
								src={`data:${part.mimeType};base64,${part.data}`}
								alt={t("chat.assistant.attached")}
								className="max-h-48 rounded-lg object-contain"
							/>
						</div>
					);
				}

				return (
					<AttachmentChip
						key={`${message.id}-${partIndex}`}
						data={data}
						mediaType={mediaType}
						filename={rawPart.filename}
						onClick={() => onOpenAttachment(data, rawPart.filename)}
					/>
				);
			})}
		</div>
	);
}
