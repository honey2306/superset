import type { TimelineItem } from "@superset/session-protocol";
import { MessageBubble } from "../../MessageBubble";
import { ToolCallRow } from "../../ToolCallRow";
import type { TimelineTurn as TimelineTurnModel } from "../../utils/timelineTurns";
import { ExecutionSummary } from "../ExecutionSummary";

interface TimelineTurnProps {
	turn: TimelineTurnModel;
	duration: string | null;
	expanded: boolean;
	onToggle(): void;
}

function itemKey(item: TimelineItem): string {
	switch (item.kind) {
		case "message":
			return item.id;
		case "tool_call":
			return `tc:${item.id}`;
		case "plan":
			return `plan:${item.id}`;
	}
}

function renderItem(item: TimelineItem) {
	switch (item.kind) {
		case "message":
			return <MessageBubble item={item} />;
		case "tool_call":
			return <ToolCallRow item={item} />;
		case "plan":
			return (
				<div className="mobile-timeline-card rounded-lg p-3 text-xs">
					<div className="mobile-caption-text mb-1">Plan</div>
					<ul className="flex flex-col gap-1">
						{item.entries.map((entry) => (
							<li key={entry.content}>
								{entry.status === "completed" ? "✓" : "○"} {entry.content}
							</li>
						))}
					</ul>
				</div>
			);
	}
}

function renderProcessItem(item: TimelineItem, expanded: boolean) {
	if (item.kind === "tool_call" && !expanded) return null;
	return <div key={itemKey(item)}>{renderItem(item)}</div>;
}

export function TimelineTurn({
	turn,
	duration,
	expanded,
	onToggle,
}: TimelineTurnProps) {
	return (
		<li className="flex flex-col gap-2" data-turn-id={turn.id}>
			{turn.preItems.map((item) => renderProcessItem(item, expanded))}
			{turn.toolCallCount > 0 || turn.messageCount > 0 ? (
				<ExecutionSummary
					toolCallCount={turn.toolCallCount}
					messageCount={turn.messageCount}
					duration={duration}
					expanded={expanded}
					onToggle={onToggle}
				/>
			) : null}
			{turn.processItems.map((item) => renderProcessItem(item, expanded))}
			{turn.finalAgentMessage ? (
				<MessageBubble item={turn.finalAgentMessage} />
			) : null}
			{turn.trailingItems.map((item) => renderProcessItem(item, expanded))}
		</li>
	);
}
