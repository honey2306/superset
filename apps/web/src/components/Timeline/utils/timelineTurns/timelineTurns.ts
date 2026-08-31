import type { TimelineItem } from "@superset/session-protocol";

type MessageItem = Extract<TimelineItem, { kind: "message" }>;
type UserMessage = MessageItem & { role: "user" };

export interface TimelineTurn {
	id: string;
	preItems: TimelineItem[];
	processItems: TimelineItem[];
	finalAgentMessage: MessageItem | null;
	trailingItems: TimelineItem[];
	toolCallCount: number;
	messageCount: number;
	startedAt: number | null;
	endedAt: number | null;
}

function isUserMessage(item: TimelineItem): item is UserMessage {
	return item.kind === "message" && item.role === "user";
}

function isAgentMessage(item: TimelineItem): item is MessageItem {
	return item.kind === "message" && item.role === "agent";
}

function countToolCalls(items: readonly TimelineItem[]): number {
	let count = 0;
	for (const item of items) {
		if (item.kind !== "tool_call") continue;
		count += 1 + countToolCalls(item.children);
	}
	return count;
}

function itemEndedAt(item: TimelineItem): number | null {
	if (item.kind === "plan") return null;
	let endedAt = item.updatedAt ?? item.startedAt ?? null;
	if (item.kind === "tool_call") {
		for (const child of item.children) {
			const childEndedAt = itemEndedAt(child);
			if (childEndedAt !== null) {
				endedAt = Math.max(endedAt ?? childEndedAt, childEndedAt);
			}
		}
	}
	return endedAt;
}

function latestItemTimestamp(items: readonly TimelineItem[]): number | null {
	let latest: number | null = null;
	for (const item of items) {
		const timestamp = itemEndedAt(item);
		if (timestamp !== null) latest = Math.max(latest ?? timestamp, timestamp);
	}
	return latest;
}

export function groupTimelineTurns(
	items: readonly TimelineItem[],
): TimelineTurn[] {
	const turns: TimelineTurn[] = [];
	let cursor = 0;

	const leadingItems: TimelineItem[] = [];
	while (cursor < items.length) {
		const item = items[cursor];
		if (!item || isUserMessage(item)) break;
		leadingItems.push(item);
		cursor += 1;
	}
	const leadingItem = leadingItems[0];
	if (leadingItem) {
		turns.push({
			id: `pre-${leadingItem.id}`,
			preItems: leadingItems,
			processItems: [],
			finalAgentMessage: null,
			trailingItems: [],
			toolCallCount: countToolCalls(leadingItems),
			messageCount: 0,
			startedAt: null,
			endedAt: latestItemTimestamp(leadingItems),
		});
	}

	while (cursor < items.length) {
		const user = items[cursor];
		if (!user || !isUserMessage(user)) {
			cursor += 1;
			continue;
		}
		cursor += 1;
		const body: TimelineItem[] = [];
		while (cursor < items.length) {
			const item = items[cursor];
			if (!item || isUserMessage(item)) break;
			body.push(item);
			cursor += 1;
		}

		let finalAgentIndex = -1;
		for (let index = body.length - 1; index >= 0; index -= 1) {
			const item = body[index];
			if (item && isAgentMessage(item)) {
				finalAgentIndex = index;
				break;
			}
		}
		const processItems =
			finalAgentIndex >= 0 ? body.slice(0, finalAgentIndex) : body;
		const finalAgentMessage =
			finalAgentIndex >= 0 ? (body[finalAgentIndex] as MessageItem) : null;
		const trailingItems =
			finalAgentIndex >= 0 ? body.slice(finalAgentIndex + 1) : [];
		const collapsibleItems = [...processItems, ...trailingItems];
		const turnItems = [user, ...body];

		turns.push({
			id: user.id,
			preItems: [user],
			processItems,
			finalAgentMessage,
			trailingItems,
			toolCallCount: countToolCalls(collapsibleItems),
			messageCount: collapsibleItems.filter((item) => item.kind === "message")
				.length,
			startedAt: user.startedAt ?? user.updatedAt ?? null,
			endedAt: latestItemTimestamp(turnItems),
		});
	}

	return turns;
}

export function getLatestUserMessageStartedAt(
	items: readonly TimelineItem[],
): number | null {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (!item || !isUserMessage(item)) continue;
		return item.startedAt ?? item.updatedAt ?? null;
	}
	return null;
}

export function getLatestTurnStartedAt(
	turns: readonly TimelineTurn[],
): number | null {
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const startedAt = turns[index]?.startedAt;
		if (startedAt !== null && startedAt !== undefined) return startedAt;
	}
	return null;
}

export function getTurnDuration(
	turn: TimelineTurn,
	now: number,
	active: boolean,
): number | null {
	if (turn.startedAt === null) return null;
	const endedAt = active ? now : turn.endedAt;
	if (endedAt === null) return null;
	return Math.max(0, endedAt - turn.startedAt);
}

export function formatElapsedDuration(durationMs: number): string {
	const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
	const hours = Math.floor(totalSeconds / 3_600);
	const minutes = Math.floor((totalSeconds % 3_600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}
