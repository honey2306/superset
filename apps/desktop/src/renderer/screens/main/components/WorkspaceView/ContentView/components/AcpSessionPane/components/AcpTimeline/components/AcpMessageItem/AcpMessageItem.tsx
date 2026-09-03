import type { MessageItem } from "@superset/session-protocol";
import type { MarkdownFileTarget } from "../../../AcpMarkdown/linkifyAcpMarkdown";
import { AcpContentBlock } from "../AcpContentBlock";

interface AcpMessageItemProps {
	item: MessageItem;
	/** Human-readable agent name shown as the author label (e.g. "Claude Code"). */
	agentLabel?: string;
	/** Hide the inline author label — used when the timeline renders its own
	 * author row above the turn's process summary. */
	hideAuthor?: boolean;
	/** Show this message's timestamp below its content. */
	showTimestamp?: boolean;
	onOpenMarkdownFile?(
		target: MarkdownFileTarget,
		openExternally: boolean,
	): void;
	onOpenUrl?(url: string): void;
}

const ROLE_NAME: Record<string, string> = {
	user: "You",
	thought: "Thinking",
};

function formatMessageTimestamp(timestamp: number) {
	const date = new Date(timestamp);
	if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return null;
	return {
		iso: date.toISOString(),
		short: date.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		}),
		full: date.toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}),
	};
}

export function AcpMessageItem({
	item,
	agentLabel,
	hideAuthor,
	showTimestamp = false,
	onOpenMarkdownFile,
	onOpenUrl,
}: AcpMessageItemProps) {
	const authorName =
		item.role === "agent"
			? (agentLabel ?? "Claude")
			: (ROLE_NAME[item.role] ?? item.role);
	const timestamp =
		showTimestamp && item.updatedAt !== undefined
			? formatMessageTimestamp(item.updatedAt)
			: null;

	return (
		<div className="acp-msg" data-message-id={item.id} data-role={item.role}>
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
					<AcpContentBlock
						// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
						key={`b-${i}`}
						block={block}
						onOpenMarkdownFile={onOpenMarkdownFile}
						onOpenUrl={onOpenUrl}
					/>
				))}
			</div>
			{timestamp && (
				<time
					className="acp-msg__time"
					dateTime={timestamp.iso}
					title={timestamp.full}
				>
					{timestamp.short}
				</time>
			)}
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
