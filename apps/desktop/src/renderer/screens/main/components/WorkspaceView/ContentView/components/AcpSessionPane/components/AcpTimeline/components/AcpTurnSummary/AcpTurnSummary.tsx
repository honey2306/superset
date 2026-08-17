interface AcpTurnSummaryProps {
	/** Turn summary text shown inline (e.g. `执行过程：3 次工具调用，1 条消息`). */
	text: string;
	/** Whether the process items are currently expanded. */
	expanded: boolean;
	onToggle(): void;
	/** Optional turn duration (e.g. `2m 15s`). Rendered as a subtle suffix. */
	duration?: string | null;
}

/**
 * A one-line collapsed summary of an earlier turn's tool activity.
 *
 * When the agent has produced a final reply for a previous turn, all of its
 * intermediate tool calls and agent scratch messages collapse behind this
 * single row. Clicking expands the full run inline; the caret rotates 90°
 * when open. Style matches the tool row (var(--acp-font-sans), var(--fg-mute),
 * one caret prefix) so a collapsed turn reads as a single continuation of the
 * transcript rather than a distinct widget.
 */
export function AcpTurnSummary({
	text,
	expanded,
	onToggle,
	duration,
}: AcpTurnSummaryProps) {
	return (
		<button
			type="button"
			className="acp-turn-summary"
			aria-expanded={expanded}
			onClick={onToggle}
		>
			<span className="acp-turn-summary__caret" aria-hidden>
				›
			</span>
			<span className="acp-turn-summary__text">{text}</span>
			{duration && (
				<span className="acp-turn-summary__duration" title="Turn duration">
					耗时 {duration}
				</span>
			)}
		</button>
	);
}
