import type {
	RequestPermissionOutcome,
	TimelineItem,
	ToolCallItem,
	ToolCallUpdate,
} from "@superset/session-protocol";
import { useEffect, useState } from "react";
import { AcpPermissionCard } from "./components/AcpPermissionCard";
import { ContentView } from "./components/ContentView";
import { DiffView } from "./components/DiffView";
import { TerminalRef } from "./components/TerminalRef";

interface AcpToolCallItemProps {
	item: ToolCallItem;
	onRespond(requestId: string, outcome: RequestPermissionOutcome): void;
	renderChild(child: TimelineItem): React.ReactNode;
}

export type ClassifiedToolCallContent =
	| { kind: "content"; content: unknown }
	| { kind: "diff"; path: string; oldText?: string | null; newText: string }
	| { kind: "terminal"; terminalId: string };

export function classifyToolCallContent(
	content: unknown,
): ClassifiedToolCallContent[] {
	if (!Array.isArray(content)) return [];
	return content.map((entry) => {
		if (entry?.type === "diff") {
			return {
				kind: "diff" as const,
				path: entry.path ?? "(unknown)",
				oldText: entry.oldText,
				newText: entry.newText ?? "",
			};
		}
		if (entry?.type === "terminal") {
			return {
				kind: "terminal" as const,
				terminalId: entry.terminalId ?? "",
			};
		}
		return { kind: "content" as const, content: entry?.content ?? entry };
	});
}

function statusText(call: ToolCallUpdate): string {
	if (!call.status) return "running";
	if (call.status === "completed") return "completed";
	if (call.status === "failed") return "failed";
	if (call.status === "in_progress") return "running";
	return call.status;
}

export function AcpToolCallItem({
	item,
	onRespond,
	renderChild,
}: AcpToolCallItemProps) {
	const [expanded, setExpanded] = useState(false);
	const call = item.call;

	const hasUnresolvedPermission = item.permissions.some(
		(p) => p.resolution === null,
	);
	useEffect(() => {
		if (hasUnresolvedPermission) {
			setExpanded(true);
		}
	}, [hasUnresolvedPermission]);

	const classified = classifyToolCallContent(call.content);
	const locations = call.locations ?? [];
	const kind = call.kind ?? "other";
	const status = call.status ?? "in_progress";

	return (
		<div className="acp-tool" data-kind={kind}>
			<button
				type="button"
				className="acp-tool__head"
				data-expanded={expanded ? "true" : undefined}
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={expanded}
			>
				<span className="acp-tool__caret" aria-hidden>
					{expanded ? "▾" : "›"}
				</span>
				<span className="acp-tool__kind">{kind}</span>
				<span className="acp-tool__title select-text cursor-text">
					{call.title ?? call.toolCallId}
				</span>
				<span className="acp-tool__meta" data-status={status}>
					{status === "in_progress" && <span className="acp-blink">●</span>}
					<span>{statusText(call)}</span>
				</span>
			</button>

			{expanded && (
				<div className="acp-tool__body">
					{locations.length > 0 && (
						<div className="acp-tool__locations">
							{locations.map((loc, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: locations have no stable id
									key={`loc-${i}`}
									className="acp-tool__location select-text cursor-text"
								>
									<b>{loc.path}</b>
									{loc.line != null ? `:${loc.line}` : ""}
								</span>
							))}
						</div>
					)}

					{item.permissions
						.filter((perm) => perm.resolution !== null)
						.map((perm) => (
							<AcpPermissionCard
								key={perm.requestId}
								permission={perm}
								onRespond={onRespond}
							/>
						))}

					{classified.length > 0 && (
						<div className="acp-tool__body-content">
							{classified.map((entry, i) => {
								if (entry.kind === "diff") {
									return (
										<DiffView
											key={`d-${entry.path}-${i}`}
											path={entry.path}
											oldText={entry.oldText}
											newText={entry.newText}
										/>
									);
								}
								if (entry.kind === "terminal") {
									return (
										<TerminalRef
											key={`t-${entry.terminalId}-${i}`}
											terminalId={entry.terminalId}
										/>
									);
								}
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
									<ContentView key={`c-${i}`} content={entry.content} />
								);
							})}
						</div>
					)}

					{item.children.length > 0 && (
						<div className="acp-tool__children">
							{item.children.map((child) => (
								<div key={child.id}>{renderChild(child)}</div>
							))}
						</div>
					)}

					{call.rawInput !== undefined && (
						<details className="acp-tool__raw">
							<summary>Input</summary>
							<pre className="select-text cursor-text">
								{JSON.stringify(call.rawInput, null, 2)?.slice(0, 2000)}
							</pre>
						</details>
					)}

					{call.rawOutput !== undefined && (
						<details className="acp-tool__raw">
							<summary>Output</summary>
							<pre className="select-text cursor-text">
								{JSON.stringify(call.rawOutput, null, 2)?.slice(0, 2000)}
							</pre>
						</details>
					)}
				</div>
			)}
		</div>
	);
}
