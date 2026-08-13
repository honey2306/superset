import type { TerminalStream } from "@superset/session-protocol";

export interface AgentCommandDetails {
	summary?: string;
	command?: string;
	output?: string;
	status?: string;
	cwd?: string;
	exitCode?: number;
	signal?: string | null;
}

interface AgentCommandDetailInput {
	title?: string | null;
	rawInput?: unknown;
	rawOutput?: unknown;
	status?: string | null;
	terminal?: TerminalStream;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function outputFromRecord(value: Record<string, unknown>): string | undefined {
	const combined = [
		nonEmptyString(value.aggregatedOutput),
		nonEmptyString(value.output),
		nonEmptyString(value.stdout),
		nonEmptyString(value.stderr),
		nonEmptyString(value.result),
	].filter((part): part is string => part !== undefined);
	return combined.length > 0 ? combined.join("\n") : undefined;
}

/**
 * ACP terminal ids identify adapter-owned tool streams, not Superset terminal
 * panes. Render the tool's own command/output alongside that opaque id.
 */
export function getAgentCommandDetails(
	input: AgentCommandDetailInput,
): AgentCommandDetails {
	const rawInput = record(input.rawInput);
	const rawOutput = record(input.rawOutput);
	const command =
		nonEmptyString(rawInput?.command) ?? nonEmptyString(rawInput?.cmd);
	const output =
		nonEmptyString(input.terminal?.output) ??
		nonEmptyString(input.rawOutput) ??
		(rawOutput ? outputFromRecord(rawOutput) : undefined);
	const summary = nonEmptyString(input.title);
	const status = nonEmptyString(input.status);
	const cwd = nonEmptyString(input.terminal?.cwd);
	return {
		...(summary ? { summary } : {}),
		...(command ? { command } : {}),
		...(output ? { output } : {}),
		...(status ? { status } : {}),
		...(cwd ? { cwd } : {}),
		...(input.terminal?.exitCode !== undefined
			? { exitCode: input.terminal.exitCode }
			: {}),
		...(input.terminal?.signal !== undefined
			? { signal: input.terminal.signal }
			: {}),
	};
}
