import type {
	ContentBlock,
	TimelineItem,
	ToolCallItem,
} from "@superset/session-protocol";
import { MessageBubble } from "./MessageBubble";
import { MessageMarkdown } from "./MessageMarkdown";

interface Props {
	item: ToolCallItem;
}

function renderContentBlock(block: ContentBlock) {
	if (block.type === "text")
		return <MessageMarkdown>{block.text}</MessageMarkdown>;
	if (block.type === "image") {
		const src = block.data.startsWith("data:")
			? block.data
			: `data:${block.mimeType};base64,${block.data}`;
		return <img src={src} alt="" className="max-h-40 max-w-full rounded" />;
	}
	if (block.type === "resource_link") {
		return <span>{block.name ?? block.uri}</span>;
	}
	if (block.type === "resource") {
		const resource = block.resource as { text?: string; uri?: string };
		return (
			<pre className="whitespace-pre-wrap">{resource.text ?? resource.uri}</pre>
		);
	}
	return <span>Audio — playback not yet supported</span>;
}

function renderChild(item: TimelineItem) {
	if (item.kind === "tool_call") return <ToolCallRow item={item} />;
	if (item.kind === "message") return <MessageBubble item={item} />;
	return (
		<div className="mobile-timeline-card rounded-lg p-2 text-xs">
			<div className="mobile-caption-text">Plan</div>
			{item.entries.map((entry) => (
				<div key={entry.content}>
					{entry.status === "completed" ? "✓" : "○"} {entry.content}
				</div>
			))}
		</div>
	);
}

export function ToolCallRow({ item }: Props) {
	const { status, title } = item.call;
	const subagent =
		item.semantics.kind === "subagent" ? item.semantics : undefined;
	const statusColor =
		status === "completed"
			? "text-green-300"
			: status === "failed"
				? "text-red-300"
				: "text-white/60";
	return (
		<div
			className="mobile-timeline-card rounded-lg p-2 text-xs"
			data-tool-semantics={item.semantics.kind}
		>
			<div className="flex items-center justify-between gap-2">
				<span>
					{subagent ? (
						<span className="mr-2 font-semibold tracking-wide">SUBAGENT</span>
					) : null}
					<span className="font-mono">{subagent?.task ?? title}</span>
				</span>
				<span className={statusColor}>{status}</span>
			</div>
			{subagent?.result.map((section, sectionIndex) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: canonical result sections have no stable id
					key={sectionIndex}
					className="mt-2 text-sm"
				>
					{section.content.map((block, blockIndex) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: ACP content blocks have no stable id
							key={blockIndex}
						>
							{renderContentBlock(block)}
						</div>
					))}
				</div>
			))}
			{item.children.length > 0 ? (
				<div className="mt-2 flex flex-col gap-2 border-l border-white/10 pl-2">
					{item.children.map((child) => (
						<div key={child.id}>{renderChild(child)}</div>
					))}
				</div>
			) : null}
		</div>
	);
}
