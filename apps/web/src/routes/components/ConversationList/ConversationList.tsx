import type { ConversationListItem } from "../../workspaces/utils/buildConversationList/buildConversationList";
import { ContinueConversationCard } from "./ContinueConversationCard";
import { ConversationCard } from "./ConversationCard";

type ConversationGroup = {
	key: string;
	label: string;
	conversations: ConversationListItem[];
};

function startOfLocalDay(timestamp: number): number {
	const date = new Date(timestamp);
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	).getTime();
}

function conversationGroupLabel(timestamp: number, now: number): string {
	const day = startOfLocalDay(timestamp);
	const today = startOfLocalDay(now);
	if (day === today) return "Today";
	if (day === today - 86_400_000) return "Yesterday";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year:
			new Date(timestamp).getFullYear() === new Date(now).getFullYear()
				? undefined
				: "numeric",
	}).format(timestamp);
}

function groupConversations(
	conversations: readonly ConversationListItem[],
	now: number,
): ConversationGroup[] {
	const groups = new Map<string, ConversationGroup>();
	for (const conversation of conversations) {
		const key = String(startOfLocalDay(conversation.updatedAt));
		const existing = groups.get(key);
		if (existing) existing.conversations.push(conversation);
		else {
			groups.set(key, {
				key,
				label: conversationGroupLabel(conversation.updatedAt, now),
				conversations: [conversation],
			});
		}
	}
	return Array.from(groups.values());
}

function projectTone(projectId: string): number {
	let hash = 0;
	for (const character of projectId) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return hash % 4;
}

export function ConversationList({
	conversations,
	loading,
	loadErrorCount,
	loadWarningCount,
}: {
	conversations: readonly ConversationListItem[];
	loading: boolean;
	loadErrorCount: number;
	loadWarningCount: number;
}) {
	if (conversations.length === 0) {
		return (
			<section className="mobile-conversation-empty">
				<strong>
					{loading ? "Loading conversations…" : "No conversations yet"}
				</strong>
				<span>
					{loading
						? "Fetching recent activity from your workspaces."
						: "Start a conversation from a workspace to see it here."}
				</span>
			</section>
		);
	}

	const groups = groupConversations(conversations, Date.now());
	const runningCount = conversations.filter(
		(conversation) => conversation.running,
	).length;

	return (
		<section className="mobile-conversations" aria-label="Recent conversations">
			<ContinueConversationCard
				conversation={conversations[0]}
				runningCount={runningCount}
			/>
			{loading ? (
				<p className="mobile-conversation-notice">Updating conversations…</p>
			) : null}
			{loadErrorCount > 0 ? (
				<output className="mobile-conversation-notice is-warning">
					Couldn’t load {loadErrorCount} workspace
					{loadErrorCount === 1 ? "" : "s"}. Showing available conversations.
				</output>
			) : null}
			{loadWarningCount > 0 ? (
				<output className="mobile-conversation-notice is-warning">
					Some workspace results may be incomplete.
				</output>
			) : null}
			{groups.map((group) => (
				<section className="mobile-conversation-group" key={group.key}>
					<h2>{group.label}</h2>
					<div className="mobile-conversation-group-list">
						{group.conversations.map((conversation) => (
							<ConversationCard
								key={`${conversation.kind}:${conversation.workspaceId}:${conversation.id}`}
								conversation={conversation}
								tone={projectTone(conversation.projectId)}
							/>
						))}
					</div>
				</section>
			))}
		</section>
	);
}
