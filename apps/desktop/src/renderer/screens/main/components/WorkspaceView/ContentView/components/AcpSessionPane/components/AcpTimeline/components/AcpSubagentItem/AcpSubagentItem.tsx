import type { TimelineItem, ToolCallItem } from "@superset/session-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { AcpContentBlock } from "../AcpContentBlock";

interface AcpSubagentItemProps {
	item: ToolCallItem;
	renderChild(child: TimelineItem): React.ReactNode;
}

export type SubagentPresentationStatus =
	| "running"
	| "awaiting_approval"
	| "completed"
	| "failed";

interface SubagentActivitySummary {
	total: number;
	completed: number;
	active: number;
}

function toolItems(items: readonly TimelineItem[]): ToolCallItem[] {
	return items.flatMap((item) =>
		item.kind === "tool_call" ? [item, ...toolItems(item.children)] : [],
	);
}

function hasUnresolvedPermission(item: ToolCallItem): boolean {
	return (
		item.permissions.some((permission) => permission.resolution === null) ||
		item.children.some(
			(child) => child.kind === "tool_call" && hasUnresolvedPermission(child),
		)
	);
}

export function getSubagentPresentationStatus(
	item: ToolCallItem,
): SubagentPresentationStatus {
	if (hasUnresolvedPermission(item)) return "awaiting_approval";
	if (item.call.status === "failed") return "failed";
	if (item.call.status === "completed") return "completed";
	const descendants = toolItems(item.children);
	if (
		descendants.length > 0 &&
		descendants.every((child) => child.call.status === "failed")
	) {
		return "failed";
	}
	return "running";
}

export function getSubagentActivitySummary(
	item: ToolCallItem,
): SubagentActivitySummary {
	const descendants = toolItems(item.children);
	return {
		total: descendants.length,
		completed: descendants.filter((child) => child.call.status === "completed")
			.length,
		active: descendants.filter(
			(child) =>
				child.call.status === "in_progress" || child.call.status === "pending",
		).length,
	};
}

export function subagentType(item: ToolCallItem): string {
	return item.semantics.kind === "subagent"
		? (item.semantics.agentType ?? "Task")
		: "Task";
}

const STATUS_LABELS: Record<SubagentPresentationStatus, string> = {
	running: "running",
	awaiting_approval: "awaiting approval",
	completed: "completed",
	failed: "failed",
};

export function AcpSubagentItem({ item, renderChild }: AcpSubagentItemProps) {
	const status = getSubagentPresentationStatus(item);
	const summary = useMemo(() => getSubagentActivitySummary(item), [item]);
	const semantics =
		item.semantics.kind === "subagent" ? item.semantics : undefined;
	const hasBody =
		item.children.length > 0 || (semantics?.result.length ?? 0) > 0;
	const manuallyToggled = useRef(false);
	const previousEndSeq = useRef(item.endSeq);
	const [expanded, setExpanded] = useState(status !== "completed");
	const [unreadCount, setUnreadCount] = useState(0);

	useEffect(() => {
		if (!manuallyToggled.current) {
			setExpanded(status !== "completed");
		}
	}, [status]);

	useEffect(() => {
		if (
			manuallyToggled.current &&
			!expanded &&
			item.endSeq > previousEndSeq.current
		) {
			setUnreadCount((count) => count + 1);
		}
		previousEndSeq.current = item.endSeq;
	}, [expanded, item.endSeq]);

	const toggleExpanded = () => {
		manuallyToggled.current = true;
		setExpanded((value) => !value);
		setUnreadCount(0);
	};

	return (
		<section
			className="acp-subagent"
			data-status={status}
			data-expanded={expanded ? "true" : "false"}
		>
			<button
				type="button"
				className="acp-subagent__head"
				onClick={toggleExpanded}
				aria-expanded={expanded}
			>
				<span className="acp-subagent__caret" aria-hidden>
					{expanded ? "▾" : "›"}
				</span>
				<span className="acp-subagent__mark" aria-hidden>
					<i />
					<i />
					<i />
					<i />
				</span>
				<span className="acp-subagent__identity">
					<span className="acp-subagent__eyebrow">
						SUBAGENT <b>{subagentType(item)}</b>
					</span>
					<span className="acp-subagent__task select-text cursor-text">
						{semantics?.task ?? item.call.title}
					</span>
				</span>
				{summary.total > 0 && (
					<span className="acp-subagent__summary">
						<span>
							{summary.total} {summary.total === 1 ? "tool" : "tools"}
						</span>
						<span aria-hidden>·</span>
						<span>{summary.completed} done</span>
						{summary.active > 0 && (
							<>
								<span aria-hidden>·</span>
								<span>{summary.active} active</span>
							</>
						)}
					</span>
				)}
				{unreadCount > 0 && !expanded && (
					<span className="acp-subagent__unread">+{unreadCount}</span>
				)}
				<span className="acp-subagent__status" data-status={status}>
					<span className="acp-subagent__status-dot" aria-hidden />
					{STATUS_LABELS[status]}
				</span>
			</button>

			{expanded && hasBody && (
				<div className="acp-subagent__body">
					{semantics?.result.map((section, sectionIndex) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: canonical result sections have no stable id
							key={sectionIndex}
							className="acp-subagent-result__section"
						>
							{section.label && semantics.result.length > 1 && (
								<div className="acp-subagent-result__label">
									{section.label}
								</div>
							)}
							{section.content.map((block, blockIndex) => (
								<AcpContentBlock
									// biome-ignore lint/suspicious/noArrayIndexKey: ACP content blocks have no stable id
									key={blockIndex}
									block={block}
								/>
							))}
						</div>
					))}
					{item.children.length > 0 && (
						<>
							<div className="acp-subagent__activity-head">
								<span>ACTIVITY</span>
								<span className="acp-subagent__activity-line" />
							</div>
							<div className="acp-subagent__children">
								{item.children.map((child) => (
									<div key={child.id}>{renderChild(child)}</div>
								))}
							</div>
						</>
					)}
				</div>
			)}
		</section>
	);
}
