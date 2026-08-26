import { Link } from "react-router-dom";
import { getPhoneRoute } from "~/lib/phone-route";
import type { ConversationListItem } from "../../workspaces/utils/buildConversationList/buildConversationList";
import { conversationPath } from "./utils/conversationPath/conversationPath";

function formatConversationTime(updatedAt: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(updatedAt);
}

export function ConversationCard({
	conversation,
	tone,
}: {
	conversation: ConversationListItem;
	tone: number;
}) {
	return (
		<Link
			to={getPhoneRoute(conversationPath(conversation))}
			className={`mobile-conversation-card mobile-project-tone-${tone}`}
		>
			<span className="mobile-conversation-card-accent" aria-hidden="true" />
			<span className="mobile-conversation-card-topline">
				<span className="mobile-project-tag">{conversation.projectTitle}</span>
				<span className="mobile-conversation-title">{conversation.title}</span>
				<time
					className="mobile-conversation-time"
					dateTime={new Date(conversation.updatedAt).toISOString()}
				>
					{formatConversationTime(conversation.updatedAt)}
				</time>
			</span>
			<span className="mobile-conversation-card-meta">
				<span className="mobile-conversation-workspace">
					{conversation.workspaceTitle}
				</span>
				<span
					className={`mobile-conversation-state ${conversation.running ? "is-running" : ""}`}
				>
					{conversation.running ? "Running" : "Idle"}
				</span>
			</span>
		</Link>
	);
}
