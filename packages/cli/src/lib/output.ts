/**
 * Terminal output primitives.
 *
 * Every read command must be able to emit machine-readable JSON, because the
 * CLI is as much an automation surface for scripts and coding agents as it is
 * a human interface. Human formatting is the fallback, not the contract.
 */

/** ESC built from its code point: a literal \x1b here trips lint rules. */
const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");

export interface OutputOptions {
	/** Emit a single JSON document instead of human-readable text. */
	json: boolean;
	/** Emit one JSON object per line, for streaming consumers. */
	jsonl: boolean;
	/** Suppress non-essential human output. Ignored for JSON. */
	quiet: boolean;
	/** Whether ANSI styling is permitted on stdout. */
	color: boolean;
}

/**
 * Colors are disabled when piped, when NO_COLOR is set, or when TERM=dumb, so
 * captured output stays clean without the caller passing a flag.
 */
export function resolveColorSupport(
	env: NodeJS.ProcessEnv = process.env,
	isTty: boolean = process.stdout.isTTY === true,
): boolean {
	if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
	if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return true;
	if (env.TERM === "dumb") return false;
	return isTty;
}

export function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

/** Display width, counting East Asian wide characters as two columns. */
export function displayWidth(text: string): number {
	let width = 0;
	for (const character of stripAnsi(text)) {
		const code = character.codePointAt(0) ?? 0;
		const isWide =
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6);
		width += isWide ? 2 : 1;
	}
	return width;
}

export function padEndVisible(text: string, target: number): string {
	const padding = Math.max(0, target - displayWidth(text));
	return `${text}${" ".repeat(padding)}`;
}

export function truncateVisible(text: string, target: number): string {
	if (displayWidth(text) <= target) return text;
	let result = "";
	let width = 0;
	for (const character of text) {
		const next = displayWidth(character);
		if (width + next > target - 1) break;
		result += character;
		width += next;
	}
	return `${result}…`;
}

export class Output {
	readonly options: OutputOptions;

	constructor(options: Partial<OutputOptions> = {}) {
		this.options = {
			json: options.json ?? false,
			jsonl: options.jsonl ?? false,
			quiet: options.quiet ?? false,
			color: options.color ?? resolveColorSupport(),
		};
	}

	get isMachineReadable(): boolean {
		return this.options.json || this.options.jsonl;
	}

	style(code: string, text: string): string {
		return this.options.color ? `${code}${text}\x1b[0m` : text;
	}

	bold(text: string): string {
		return this.style("\x1b[1m", text);
	}

	dim(text: string): string {
		return this.style("\x1b[2m", text);
	}

	green(text: string): string {
		return this.style("\x1b[32m", text);
	}

	yellow(text: string): string {
		return this.style("\x1b[33m", text);
	}

	red(text: string): string {
		return this.style("\x1b[31m", text);
	}

	cyan(text: string): string {
		return this.style("\x1b[36m", text);
	}

	gray(text: string): string {
		return this.style("\x1b[90m", text);
	}

	/** Write a human-facing line. Suppressed by --quiet and in JSON modes. */
	line(text = ""): void {
		if (this.isMachineReadable || this.options.quiet) return;
		process.stdout.write(`${text}\n`);
	}

	/** Write a line that --quiet should keep (primary command result). */
	result(text: string): void {
		if (this.isMachineReadable) return;
		process.stdout.write(`${text}\n`);
	}

	/** Emit the machine-readable payload for a command. */
	json(value: unknown): void {
		if (!this.isMachineReadable) return;
		process.stdout.write(`${JSON.stringify(value)}\n`);
	}

	/** Emit one JSONL record; ignored unless --jsonl was requested. */
	jsonl(value: unknown): void {
		if (!this.options.jsonl) return;
		process.stdout.write(`${JSON.stringify(value)}\n`);
	}

	/** Diagnostics go to stderr so they never corrupt piped stdout. */
	warn(text: string): void {
		process.stderr.write(`${this.yellow("warning")} ${text}\n`);
	}

	error(text: string): void {
		process.stderr.write(`${this.red("error")} ${text}\n`);
	}

	/** Render aligned columns, skipping entirely in machine-readable modes. */
	table(rows: readonly (readonly string[])[], indent = "  "): void {
		if (this.isMachineReadable || rows.length === 0) return;
		const columns = Math.max(...rows.map((row) => row.length));
		const widths: number[] = [];
		for (let column = 0; column < columns; column++) {
			widths[column] = Math.max(
				...rows.map((row) => displayWidth(row[column] ?? "")),
			);
		}
		for (const row of rows) {
			const cells = row.map((cell, column) =>
				column === row.length - 1
					? cell
					: padEndVisible(cell, widths[column] ?? 0),
			);
			// Trailing padding is never wanted: it pollutes copy-paste and diffs
			// whenever a row's last columns are empty.
			this.line(`${indent}${cells.join("  ")}`.trimEnd());
		}
	}
}
