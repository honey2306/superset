import type {
	ToolCall,
	ToolCallLocation,
	ToolCallStatus,
	ToolKind,
} from "../acp";

export interface CanonicalToolCall
	extends Omit<ToolCall, "kind" | "status" | "locations"> {
	kind: ToolKind;
	status: ToolCallStatus;
	locations: ToolCallLocation[];
}

const GENERIC_TITLES: Partial<Record<ToolKind, ReadonlySet<string>>> = {
	read: new Set(["read", "read file"]),
	edit: new Set(["edit", "edit file", "write", "write file"]),
	delete: new Set(["delete", "delete file"]),
	move: new Set(["move", "move file", "rename", "rename file"]),
	search: new Set(["search", "find"]),
	execute: new Set([
		"bash",
		"command",
		"execute",
		"execute command",
		"run command",
		"shell",
	]),
	fetch: new Set(["fetch", "web fetch"]),
};

const DEFAULT_TITLES: Record<ToolKind, string> = {
	read: "Read",
	edit: "Edit",
	delete: "Delete",
	move: "Move",
	search: "Search",
	execute: "Execute",
	think: "Think",
	fetch: "Fetch",
	switch_mode: "Switch mode",
	other: "Tool",
};

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function firstString(
	input: Record<string, unknown> | null,
	keys: readonly string[],
): string | null {
	for (const key of keys) {
		const value = input?.[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

function inferredTitle(call: ToolCall, kind: ToolKind): string | null {
	const input = record(call.rawInput);
	const firstLocation = call.locations?.find((location) =>
		location.path.trim(),
	);

	switch (kind) {
		case "read":
		case "edit":
		case "delete":
		case "move":
			return (
				firstLocation?.path.trim() ??
				firstString(input, ["path", "filePath", "file_path", "file"])
			);
		case "execute":
			return firstString(input, ["command", "cmd"]);
		case "search":
			return firstString(input, ["query", "pattern", "search", "term"]);
		case "fetch":
			return firstString(input, ["url", "uri"]);
		default:
			return null;
	}
}

/**
 * Projects adapter-authored ACP tool data into the stable shape consumed by
 * every Superset renderer. Adapter-specific payloads remain available as raw
 * diagnostics, but primary UI fields never require renderer-side guessing.
 */
export function canonicalizeToolCall(call: ToolCall): CanonicalToolCall {
	const kind = call.kind ?? "other";
	const status = call.status ?? "pending";
	const locations =
		call.locations?.filter((location) => location.path.trim()) ?? [];
	const adapterTitle = call.title.trim();
	const isGeneric =
		adapterTitle.length === 0 ||
		GENERIC_TITLES[kind]?.has(adapterTitle.toLowerCase()) === true;
	const title = isGeneric
		? (inferredTitle({ ...call, locations }, kind) ??
			(adapterTitle || DEFAULT_TITLES[kind]))
		: adapterTitle;

	return { ...call, title, kind, status, locations };
}
