import type { FoldedTimeline, TimelineItem } from "@superset/session-protocol";
import { MessageBubble } from "./MessageBubble";
import { ToolCallRow } from "./ToolCallRow";

interface Props {
	timeline: FoldedTimeline;
}

export function TimelineView({ timeline }: Props) {
	if (timeline.items.length === 0) {
		return (
			<div className="mobile-caption-text mt-16 text-center text-sm">
				Send a message to begin.
			</div>
		);
	}
	return (
		<ol className="flex flex-col gap-2 py-2">
			{timeline.items.map((item) => (
				<li key={itemKey(item)}>{renderItem(item)}</li>
			))}
		</ol>
	);
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
						{item.entries.map((e) => (
							<li key={e.content}>
								{e.status === "completed" ? "✓" : "○"} {e.content}
							</li>
						))}
					</ul>
				</div>
			);
	}
}
