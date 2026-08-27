import type {
	RequestPermissionOutcome,
	RespondToPermissionResult,
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
	): Promise<RespondToPermissionResult> | Promise<void>;
	renderChild(child: TimelineItem): React.ReactNode;
}

export type ClassifiedToolCallContent =
	| { kind: "content"; content: unknown }
	| { kind: "diff"; path: string; oldText?: string | null; newText: string }
	| { kind: "terminal"; terminalId: string };

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringField(value: unknown, key: string): string | undefined {
	const found = record(value)?.[key];
	return typeof found === "string" && found.length > 0 ? found : undefined;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "string") return record(value);
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
	try {
		return record(JSON.parse(trimmed));
	} catch {
		return null;
	}
}

function canonicalJson(value: unknown): string | null {
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

function contentTextValue(content: unknown): string | undefined {
	const contentRecord = record(content);
	return contentRecord?.type === "text" &&
		typeof contentRecord.text === "string"
		? contentRecord.text
		: undefined;
}

function isRawOutputEcho(
	entry: ClassifiedToolCallContent,
	rawOutput: unknown,
): boolean {
	if (entry.kind !== "content") return false;
	const text = contentTextValue(entry.content);
	if (!text) return false;
	if (typeof rawOutput === "string" && text.trim() === rawOutput.trim())
		return true;
	const parsed = parseJsonRecord(text);
	return Boolean(parsed && canonicalJson(parsed) === canonicalJson(rawOutput));
}

function firstTextContent(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined;
	for (const entry of content) {
		const entryRecord = record(entry);
		if (entryRecord?.type === "text" && typeof entryRecord.text === "string") {
			return entryRecord.text;
		}
		const nested = record(entryRecord?.content);
		if (nested?.type === "text" && typeof nested.text === "string") {
			return nested.text;
		}
	}
	return undefined;
}

function pathFromToolOutput(
	output: Record<string, unknown>,
	title?: string,
): string {
	const details = record(output.details);
	const explicitPath =
		stringField(details, "path") ?? stringField(output, "path");
	if (explicitPath) return explicitPath;
	const text = firstTextContent(output.content);
	const textPath = text?.match(/\bin\s+([^\s]+)\.?$/)?.[1];
	if (textPath) return textPath.replace(/\.$/, "");
	const titlePath = title?.match(/^Edit\s+(.+)$/)?.[1];
	return titlePath ?? "(unknown)";
}

function classifyEntries(content: unknown): ClassifiedToolCallContent[] {
	if (!Array.isArray(content)) return [];
	return content.map((entry) => {
		const entryRecord = record(entry);
		if (entryRecord?.type === "diff") {
			return {
				kind: "diff" as const,
				path: stringField(entryRecord, "path") ?? "(unknown)",
				oldText:
					typeof entryRecord.oldText === "string" ? entryRecord.oldText : null,
				newText: stringField(entryRecord, "newText") ?? "",
			};
		}
		if (entryRecord?.type === "terminal") {
			return {
				kind: "terminal" as const,
				terminalId: stringField(entryRecord, "terminalId") ?? "",
			};
		}
		return { kind: "content" as const, content: entryRecord?.content ?? entry };
	});
}

function textContent(text: string): ClassifiedToolCallContent {
	return { kind: "content", content: { type: "text", text } };
}

function genericRawOutputContent(
	output: Record<string, unknown>,
): ClassifiedToolCallContent[] {
	const details = record(output.details);
	const stdout =
		stringField(output, "stdout") ?? stringField(details, "stdout");
	const stderr =
		stringField(output, "stderr") ?? stringField(details, "stderr");
	if (stdout || stderr) {
		return [
			textContent(
				[
					stdout ? `stdout\n${stdout}` : null,
					stderr ? `stderr\n${stderr}` : null,
				]
					.filter(Boolean)
					.join("\n\n"),
			),
		];
	}
	const text =
		stringField(output, "content") ??
		stringField(output, "output") ??
		stringField(output, "text") ??
		stringField(output, "result") ??
		stringField(details, "content") ??
		stringField(details, "output") ??
		stringField(details, "text") ??
		stringField(details, "result");
	return text ? [textContent(text)] : [];
}

function classifyRawToolOutput(
	rawOutput: unknown,
	title?: string,
): ClassifiedToolCallContent[] {
	const output = parseJsonRecord(rawOutput);
	if (!output) return [];
	const details = record(output.details);
	const mcpResult = record(details?.mcpResult);
	const direct = [
		...classifyEntries(output.content),
		...classifyEntries(mcpResult?.content),
	];
	const structured =
		direct.length > 0 ? direct : genericRawOutputContent(output);
	if (structured.some((entry) => entry.kind === "diff")) return structured;
	const diff = stringField(details, "diff");
	if (!diff) return structured;
	return [
		...structured,
		{
			kind: "diff" as const,
			path: pathFromToolOutput(output, title),
			oldText: null,
			newText: diff,
		},
	];
}

export function classifyToolCallContent(
	content: unknown,
	rawOutput?: unknown,
	title?: string,
): ClassifiedToolCallContent[] {
	const direct = classifyEntries(content);
	if (direct.some((entry) => entry.kind === "diff")) return direct;
	const structuredRaw = classifyRawToolOutput(rawOutput, title);
	if (structuredRaw.length === 0) return direct;
	const meaningfulDirect = direct.filter(
		(entry) => !isRawOutputEcho(entry, rawOutput),
	);
	return [...meaningfulDirect, ...structuredRaw];
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

/** Human-readable verb shown next to the tool title.
 *
 * The ACP protocol emits kinds like `read`, `edit`, `execute` — technically
 * accurate but read as terminal command names. The prose-style tool row wants
 * verbs that scan as English ("Read acp-pane.css", "Run bun run typecheck"),
 * so we title-case and remap `execute` → `Run` for readability. `switch_mode`
 * becomes `Switch mode`; anything unknown falls back to Title case. */
export function kindVerb(kind: string): string {
	if (kind === "execute") return "Run";
	if (kind === "switch_mode") return "Switch mode";
	if (!kind) return "";
	return kind.charAt(0).toUpperCase() + kind.slice(1);
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

	const classified = classifyToolCallContent(
		call.content,
		call.rawOutput,
		call.title,
	);
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
					›
				</span>
				<span className="acp-tool__kind">{kindVerb(kind)}</span>
				<span className="acp-tool__title select-text cursor-text">{title}</span>
				<span
					className="acp-tool__meta"
					data-status={hasUnresolvedPermission ? "awaiting_approval" : status}
				>
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
									<ContentView
										// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
										key={`c-${i}`}
										content={entry.content}
									/>
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
