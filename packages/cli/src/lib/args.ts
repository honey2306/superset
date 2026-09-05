/**
 * Minimal argv parser.
 *
 * Deliberately hand-rolled rather than pulled from a dependency: the surface
 * is small, and a compiled binary benefits from having no parser in the tree.
 *
 * Supports `--flag`, `--key value`, `--key=value`, `--no-flag`, short `-x`,
 * repeated options, and `--` to stop parsing.
 */

import { usageError } from "./exit-codes";

export interface ParsedArgs {
	/** Positional arguments, in order, excluding anything after `--`. */
	positionals: string[];
	/** Everything after a bare `--`, passed through untouched. */
	passthrough: string[];
	options: Map<string, string[]>;
}

/** Options that take a value; anything else is treated as a boolean flag. */
export type ValueOptionSet = ReadonlySet<string>;

export function parseArgs(
	argv: readonly string[],
	valueOptions: ValueOptionSet = new Set(),
): ParsedArgs {
	const positionals: string[] = [];
	const passthrough: string[] = [];
	const options = new Map<string, string[]>();

	const push = (key: string, value: string) => {
		const existing = options.get(key);
		if (existing) existing.push(value);
		else options.set(key, [value]);
	};

	let index = 0;
	for (; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === undefined) continue;

		if (arg === "--") {
			passthrough.push(...argv.slice(index + 1));
			break;
		}

		if (arg.startsWith("--")) {
			const body = arg.slice(2);
			const eq = body.indexOf("=");
			if (eq >= 0) {
				push(body.slice(0, eq), body.slice(eq + 1));
				continue;
			}
			if (body.startsWith("no-")) {
				push(body.slice(3), "false");
				continue;
			}
			if (valueOptions.has(body)) {
				const next = argv[index + 1];
				if (next === undefined || next === "--") {
					throw usageError(`Option --${body} requires a value.`);
				}
				push(body, next);
				index++;
				continue;
			}
			push(body, "true");
			continue;
		}

		if (arg.startsWith("-") && arg.length > 1) {
			const body = arg.slice(1);
			if (valueOptions.has(body)) {
				const next = argv[index + 1];
				if (next === undefined || next === "--") {
					throw usageError(`Option -${body} requires a value.`);
				}
				push(body, next);
				index++;
				continue;
			}
			push(body, "true");
			continue;
		}

		positionals.push(arg);
	}

	return { positionals, passthrough, options };
}

export function getOption(
	args: ParsedArgs,
	...names: string[]
): string | undefined {
	for (const name of names) {
		const values = args.options.get(name);
		if (values && values.length > 0) return values[values.length - 1];
	}
	return undefined;
}

export function getOptionAll(args: ParsedArgs, ...names: string[]): string[] {
	const collected: string[] = [];
	for (const name of names) {
		const values = args.options.get(name);
		if (values) collected.push(...values);
	}
	return collected;
}

export function getFlag(args: ParsedArgs, ...names: string[]): boolean {
	const value = getOption(args, ...names);
	if (value === undefined) return false;
	return value !== "false";
}

export function getNumberOption(
	args: ParsedArgs,
	...names: string[]
): number | undefined {
	const raw = getOption(args, ...names);
	if (raw === undefined) return undefined;
	const value = Number(raw);
	if (!Number.isFinite(value)) {
		throw usageError(`Expected a number for --${names[0]}, got: ${raw}`);
	}
	return value;
}

/**
 * Parse a duration such as `30s`, `10m`, `2h`, or a bare number of seconds,
 * returning milliseconds.
 */
export function parseDuration(raw: string): number {
	const match = raw.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
	if (!match?.[1]) {
		throw usageError(
			`Invalid duration: ${raw}`,
			"Use a value like 30s, 10m, 2h, or 500ms.",
		);
	}
	const amount = Number(match[1]);
	switch (match[2]) {
		case "ms":
			return amount;
		case "m":
			return amount * 60_000;
		case "h":
			return amount * 3_600_000;
		default:
			return amount * 1_000;
	}
}
