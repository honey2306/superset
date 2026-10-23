import type { PlanEntry } from "../acp";
import type { TerminalStreamPatch, ToolCallPatch } from "../conversation";

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pi 0.0.33 emits terminal state across three independently-shaped `_meta`
 * payloads. The update's toolCallId determines ownership; terminal_id is an
 * opaque adapter identifier and may legitimately differ from it.
 */
export function terminalStreamPatches(
	patch: ToolCallPatch,
): TerminalStreamPatch[] {
	const meta = asRecord(patch._meta);
	if (!meta) return [];
	const info = asRecord(meta.terminal_info);
	const output = asRecord(meta.terminal_output);
	const exit = asRecord(meta.terminal_exit);
	const result: TerminalStreamPatch[] = [];
	if (info) {
		const terminalId = nonEmptyString(info.terminal_id);
		const cwd = nonEmptyString(info.cwd);
		if (terminalId) result.push({ terminalId, ...(cwd ? { cwd } : {}) });
	}
	if (output) {
		const terminalId = nonEmptyString(output.terminal_id);
		const outputDelta = nonEmptyString(output.data);
		// Pi's bashOutputDelta explicitly supplies deltas. Empty frames only
		// signal activity, so they must not invent output.
		if (terminalId) {
			result.push({ terminalId, ...(outputDelta ? { outputDelta } : {}) });
		}
	}
	if (exit) {
		const terminalId = nonEmptyString(exit.terminal_id);
		const exitCode =
			typeof exit.exit_code === "number" && Number.isFinite(exit.exit_code)
				? exit.exit_code
				: undefined;
		const signal =
			typeof exit.signal === "string" || exit.signal === null
				? exit.signal
				: undefined;
		if (terminalId) {
			result.push({
				terminalId,
				...(exitCode !== undefined ? { exitCode } : {}),
				...(signal !== undefined ? { signal } : {}),
			});
		}
	}
	return result;
}

export function parentToolCallId(source: { _meta?: unknown }): string | null {
	const meta = asRecord(source._meta);
	if (!meta) return null;
	const semantic = asRecord(meta["sh.superset/toolSemantic"]);
	const canonicalParent = nonEmptyString(semantic?.parentToolCallId);
	if (canonicalParent) return canonicalParent;
	const claudeCode = asRecord(meta.claudeCode);
	return nonEmptyString(claudeCode?.parentToolUseId);
}

export function extractPlanEntries(plan: unknown): PlanEntry[] | null {
	if (
		typeof plan === "object" &&
		plan !== null &&
		"entries" in plan &&
		Array.isArray((plan as { entries: unknown }).entries)
	) {
		return (plan as { entries: PlanEntry[] }).entries;
	}
	return null;
}
