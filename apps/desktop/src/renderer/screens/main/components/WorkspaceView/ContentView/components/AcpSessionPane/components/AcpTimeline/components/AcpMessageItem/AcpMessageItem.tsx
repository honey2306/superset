import type { MessageItem } from "@superset/session-protocol";
import { AcpContentBlock } from "../AcpContentBlock";

interface AcpMessageItemProps {
	item: MessageItem;
	/** Human-readable agent name shown as the author label (e.g. "Claude Code"). */
	agentLabel?: string;
	/** Hide the inline author label — used when the timeline renders its own
	 * author row above the turn's process summary. */
	hideAuthor?: boolean;
}

const ROLE_NAME: Record<string, string> = {
	user: "You",
	thought: "Thinking",
};

export function AcpMessageItem({
	item,
	agentLabel,
	hideAuthor,
}: AcpMessageItemProps) {
	const authorName =
		item.role === "agent"
			? (agentLabel ?? "Claude")
			: (ROLE_NAME[item.role] ?? item.role);

	return (
		<div className="acp-msg" data-role={item.role}>
			{!hideAuthor && (
				<div className="acp-msg__author">
					<span className="acp-msg__author-name">{authorName}</span>
					{item.failed && (
						<span className="acp-msg__author-fail select-text cursor-text">
							prompt not admitted
						</span>
					)}
				</div>
			)}
			<div className="acp-msg__bubble">
				{item.blocks.map((block, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
					<AcpContentBlock key={`b-${i}`} block={block} />
				))}
			</div>
		</div>
	);
}

/**
 * Standalone agent author row — rendered by AcpTimeline above a turn's
 * process summary so that the "CLAUDE" label heads the whole turn instead
 * of only its final reply.
 */
export function AcpAgentAuthorRow({ agentLabel }: { agentLabel?: string }) {
	return (
		<div className="acp-msg acp-msg--author-only" data-role="agent">
			<div className="acp-msg__author">
				<span className="acp-msg__author-name">{agentLabel ?? "Claude"}</span>
			</div>
		</div>
	);
}
