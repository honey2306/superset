import { Link } from "react-router-dom";
import { getPhoneRoute } from "~/lib/phone-route";
import type { ConversationListItem } from "../../workspaces/utils/buildConversationList/buildConversationList";
import { conversationPath } from "./utils/conversationPath/conversationPath";

export function ContinueConversationCard({
	conversation,
	runningCount,
}: {
	conversation: ConversationListItem;
	runningCount: number;
}) {
	return (
		<Link
			to={getPhoneRoute(conversationPath(conversation))}
			className="mobile-continue-conversation"
		>
			<span className="mobile-continue-copy">
				<strong>Continue where you left off</strong>
				<span>
					{conversation.projectTitle} · {conversation.workspaceTitle}
				</span>
			</span>
			{runningCount > 0 ? (
				<span className="mobile-running-summary">
					<span aria-hidden="true" />
					{runningCount} running
				</span>
			) : (
				<span className="mobile-continue-arrow" aria-hidden="true">
					›
				</span>
			)}
		</Link>
	);
}
