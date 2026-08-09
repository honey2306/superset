import type {
	RequestPermissionOutcome,
	TimelineItem,
	ToolCallItem,
	ToolCallUpdate,
} from "@superset/session-protocol";
import { useEffect, useState } from "react";
import {
	AcpPermissionCard,
	isAskUserPermission,
} from "./components/AcpPermissionCard";
import { ContentView } from "./components/ContentView";
import { DiffView } from "./components/DiffView";
import { TerminalRef } from "./components/TerminalRef";

interface AcpToolCallItemProps {
	item: ToolCallItem;
	presentation?: "default" | "subagent";
	onOpenFile?(path: string): void;
	onRespond(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<void>;
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

export function toolCallStatusText(
	call: ToolCallUpdate,
	hasUnresolvedPermission: boolean,
): string {
	if (hasUnresolvedPermission) return "awaiting approval";
	if (!call.status) return "running";
	if (call.status === "completed") return "completed";
	if (call.status === "failed") return "failed";
	if (call.status === "in_progress") return "running";
	return call.status;
}

export function formatRawToolCallContent(content: unknown): string | undefined {
	return JSON.stringify(content, null, 2);
}

export function AcpToolCallItem({
	item,
	presentation = "default",
	onOpenFile,
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
	const { kind, locations, status, title } = call;

	return (
		<div className="acp-tool" data-kind={kind} data-presentation={presentation}>
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
				<span className="acp-tool__title select-text cursor-text">{title}</span>
				<span
					className="acp-tool__meta"
					data-status={hasUnresolvedPermission ? "awaiting_approval" : status}
				>
					{status === "in_progress" && !hasUnresolvedPermission && (
						<span className="acp-blink">●</span>
					)}
					<span>{toolCallStatusText(call, hasUnresolvedPermission)}</span>
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
								sourceToolCall={call}
								variant={
									isAskUserPermission(perm, call) ? "askuser" : "permission"
								}
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
											onOpenFile={onOpenFile}
										/>
									);
								}
								if (entry.kind === "terminal") {
									return (
										<TerminalRef
											key={`t-${entry.terminalId}-${i}`}
											terminalId={entry.terminalId}
											title={call.title}
											rawInput={call.rawInput}
											rawOutput={call.rawOutput}
											status={call.status}
											terminal={item.terminals?.[entry.terminalId]}
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
								{formatRawToolCallContent(call.rawInput)}
							</pre>
						</details>
					)}

					{call.rawOutput !== undefined && (
						<details className="acp-tool__raw">
							<summary>Output</summary>
							<pre className="select-text cursor-text">
								{formatRawToolCallContent(call.rawOutput)}
							</pre>
						</details>
					)}
				</div>
			)}
		</div>
	);
}
