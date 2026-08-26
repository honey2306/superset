import type { ConversationListItem } from "../../../../workspaces/utils/buildConversationList/buildConversationList";

export function conversationPath(conversation: ConversationListItem): string {
	const kindPath = conversation.kind === "acp" ? "s" : "t";
	return `/w/${encodeURIComponent(conversation.workspaceId)}/${kindPath}/${encodeURIComponent(conversation.id)}`;
}
