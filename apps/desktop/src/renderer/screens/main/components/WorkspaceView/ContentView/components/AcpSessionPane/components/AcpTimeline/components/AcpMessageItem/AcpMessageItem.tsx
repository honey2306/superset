import type { MessageItem } from "@superset/session-protocol";
import { AcpContentBlock } from "../AcpContentBlock";

interface AcpMessageItemProps {
	item: MessageItem;
	/** Human-readable agent name shown as the author label (e.g. "Claude Code"). */
	agentLabel?: string;
}

const ROLE_NAME: Record<string, string> = {
	user: "You",
	thought: "Thinking",
};

export function AcpMessageItem({ item, agentLabel }: AcpMessageItemProps) {
	const authorName =
		item.role === "agent"
			? (agentLabel ?? "Claude")
			: (ROLE_NAME[item.role] ?? item.role);

	return (
		<div className="acp-msg" data-role={item.role}>
			<div className="acp-msg__author">
				<span className="acp-msg__author-name">{authorName}</span>
				{item.failed && (
					<span className="acp-msg__author-fail select-text cursor-text">
						prompt not admitted
					</span>
				)}
			</div>
			<div className="acp-msg__bubble">
				{item.blocks.map((block, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
					<AcpContentBlock key={`b-${i}`} block={block} />
				))}
			</div>
		</div>
	);
}
