import type { ContentBlock } from "../acp";
import type { CanonicalToolCall } from "./canonical-tool-call";

export const TOOL_SEMANTIC_META_KEY = "sh.superset/toolSemantic";

export interface SubagentResultSection {
	label?: string;
	content: ContentBlock[];
}

export type ToolCallSemantics =
	| { kind: "tool" }
	| {
			kind: "subagent";
			task: string;
			agentType: string | null;
			result: SubagentResultSection[];
	  };

interface TimelineChild {
	kind: string;
}

const SUBAGENT_TITLES = new Set([
	"delegate",
	"spawn agent",
	"spawn_agent",
	"subagent",
	"task",
]);
const WORKFLOW_RESULT_PREFIX =
	/^(?:Run fan-out: \d+\/\d+ used, \d+ remaining\r?\n)?Workflow completed(?: with \d+ child run\(s\))?\.\s*Return:\s*/;
const METADATA_KEYS = new Set([
	"agent",
	"artifactPaths",
	"key",
	"results",
	"runId",
]);
const FOREGROUND_DIAGNOSTIC = /\n\n(?:Emitted|Console|Call trace|Mission):/;
const ASYNC_DIAGNOSTIC = /(?: Emitted: .*?)? Trace: \d+ event\(s\)\.$/s;

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function firstString(value: unknown, keys: readonly string[]): string | null {
	const source = record(value);
	for (const key of keys) {
		const candidate = source?.[key];
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.trim();
		}
	}
	return null;
}

function reservedSemantic(
	call: CanonicalToolCall,
): Record<string, unknown> | null {
	const meta = record(call._meta);
	const semantic = meta?.[TOOL_SEMANTIC_META_KEY];
	if (semantic === "subagent") return { kind: "subagent" };
	const value = record(semantic);
	return value?.kind === "subagent" ? value : null;
}

function claudeToolName(call: CanonicalToolCall): string | null {
	const claudeCode = record(record(call._meta)?.claudeCode);
	return firstString(claudeCode, ["toolName"]);
}

function isSubagent(
	call: CanonicalToolCall,
	children: readonly TimelineChild[],
) {
	if (reservedSemantic(call)) return true;
	if (children.length > 0) return true;
	if (claudeToolName(call)?.toLowerCase() === "task") return true;
	return SUBAGENT_TITLES.has(call.title.trim().toLowerCase());
}

function primaryReturnText(source: string): string {
	const foregroundDiagnostic = source.search(FOREGROUND_DIAGNOSTIC);
	const withoutForegroundDiagnostics =
		foregroundDiagnostic >= 0 ? source.slice(0, foregroundDiagnostic) : source;
	return withoutForegroundDiagnostics.replace(ASYNC_DIAGNOSTIC, "").trim();
}

function firstJsonValue(source: string): unknown {
	const trimmed = source.trimStart();
	const opening = trimmed[0];
	if (opening !== "{" && opening !== "[") return JSON.parse(trimmed);
	const closing = opening === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = 0; index < trimmed.length; index += 1) {
		const character = trimmed[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') {
			inString = true;
			continue;
		}
		if (character === opening) depth += 1;
		if (character === closing) depth -= 1;
		if (depth === 0) return JSON.parse(trimmed.slice(0, index + 1));
	}
	throw new Error("Incomplete workflow result");
}

function textSection(markdown: string, label?: string): SubagentResultSection {
	return {
		...(label ? { label } : {}),
		content: [{ type: "text", text: markdown }],
	};
}

function parseWorkflowResult(text: string): SubagentResultSection[] | null {
	const match = WORKFLOW_RESULT_PREFIX.exec(text);
	if (!match) return null;
	const returnText = primaryReturnText(text.slice(match[0].length));
	if (!returnText) return null;
	try {
		const value = firstJsonValue(returnText);
		if (typeof value === "string" && value.trim()) {
			return [textSection(value)];
		}
		if (Array.isArray(value)) {
			const sections = value.flatMap((output) =>
				typeof output === "string" && output.trim()
					? [textSection(output)]
					: [],
			);
			return sections.length > 0 ? sections : null;
		}
		const valueRecord = record(value);
		if (!valueRecord) return null;
		if (typeof valueRecord.output === "string" && valueRecord.output.trim()) {
			return [textSection(valueRecord.output)];
		}
		const sections = Object.entries(valueRecord).flatMap(([label, output]) =>
			typeof output === "string" && output.trim() && !METADATA_KEYS.has(label)
				? [textSection(output, label)]
				: [],
		);
		return sections.length > 0 ? sections : null;
	} catch {
		return [textSection(returnText)];
	}
}

function resultSections(call: CanonicalToolCall): SubagentResultSection[] {
	const sections: SubagentResultSection[] = [];
	for (const entry of call.content ?? []) {
		if (entry.type !== "content") continue;
		const block = entry.content;
		if (block.type === "text") {
			sections.push(
				...(parseWorkflowResult(block.text) ?? [{ content: [block] }]),
			);
		} else {
			sections.push({ content: [block] });
		}
	}
	return sections;
}

export function canonicalizeToolCallSemantics(
	call: CanonicalToolCall,
	children: readonly TimelineChild[],
): ToolCallSemantics {
	if (!isSubagent(call, children)) return { kind: "tool" };
	const reserved = reservedSemantic(call);
	return {
		kind: "subagent",
		task:
			firstString(reserved, ["task"]) ??
			firstString(call.rawInput, ["task", "prompt", "description"]) ??
			call.title,
		agentType:
			firstString(reserved, ["agentType"]) ??
			firstString(call.rawInput, [
				"subagent_type",
				"subagentType",
				"agent_type",
				"agentType",
				"agent",
			]),
		result: resultSections(call),
	};
}
