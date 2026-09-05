/**
 * Per-invocation command context.
 *
 * The host connection is established lazily so commands that never touch the
 * host-service (`--help`, `version`) work with the desktop app closed, and so
 * a single command pays the health-check cost at most once.
 */

import type { ParsedArgs } from "./args";
import { getFlag } from "./args";
import { connectToHost, type HostConnection } from "./host-connection";
import { Output, resolveColorSupport } from "./output";

export interface CommandContext {
	args: ParsedArgs;
	out: Output;
	env: NodeJS.ProcessEnv;
	/** Connect on first use; subsequent calls reuse the same connection. */
	host(): Promise<HostConnection>;
}

/** Options accepted by every command. */
export const GLOBAL_FLAGS = [
	"json",
	"jsonl",
	"quiet",
	"color",
	"help",
] as const;

export function createContext(
	args: ParsedArgs,
	env: NodeJS.ProcessEnv = process.env,
): CommandContext {
	const colorRequested = args.options.has("color")
		? getFlag(args, "color")
		: resolveColorSupport(env);

	const out = new Output({
		json: getFlag(args, "json"),
		jsonl: getFlag(args, "jsonl"),
		quiet: getFlag(args, "quiet"),
		color: colorRequested,
	});

	let connection: Promise<HostConnection> | undefined;

	return {
		args,
		out,
		env,
		host() {
			connection ??= connectToHost({ env });
			return connection;
		},
	};
}
