/**
 * Line-oriented REPL input.
 *
 * Two readers back the same `LineReader` interface:
 *
 * - `PipedLineReader` for non-TTY stdin: consume lines as they arrive.
 * - `RawModeLineEditor` for TTY stdin: raw single-byte input with echo,
 *   cursor movement, and history navigation, because the terminal's own line
 *   discipline is disabled in raw mode.
 *
 * Multi-line input starts with backslash-enter and ends with a bare enter on
 * its own line, mirroring the convention users already know from other
 * terminal agents.
 */

export interface LineReader {
	/** Await the next input line; returns undefined at end of input. */
	next(): Promise<string | undefined>;
}

const CTRL_C = "\x03";
const CTRL_D = "\x04";
const ENTER = "\r";
const LF = "\n";
const BACKSPACE = "\x7f";
const CTRL_H = "\x08";
const ESC = "\x1b";

/** Display width of a character, counting East Asian wide chars as 2 columns. */
function echoWidth(character: string): number {
	const code = character.codePointAt(0) ?? 0;
	const isWide =
		(code >= 0x1100 && code <= 0x115f) ||
		(code >= 0x2e80 && code <= 0xa4cf) ||
		(code >= 0xac00 && code <= 0xd7af) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe30 && code <= 0xfe6f) ||
		(code >= 0xff00 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6);
	return isWide ? 2 : 1;
}

function textWidth(text: string): number {
	let cells = 0;
	for (const character of text) cells += echoWidth(character);
	return cells;
}

/**
 * Raw-mode line editor with echo, cursor movement, and history.
 *
 * The cursor is tracked in UTF-16 code units against `buffer`; every edit
 * redraws the tail of the line after the cursor, so wide characters and
 * mid-line edits stay aligned without tracking per-character columns.
 */
export class RawModeLineEditor implements LineReader {
	private buffer = "";
	/** Cursor position in UTF-16 code units, 0..buffer.length. */
	private cursor = 0;
	private done = false;
	private pending:
		| {
				resolve: (line: string | undefined) => void;
				reject: (error: Error) => void;
		  }
		| undefined;

	/** True after a first Ctrl-C on an empty line; a second one exits. */
	private interruptedOnce = false;

	private readonly history: string[] = [];
	private historyIndex = this.history.length;

	constructor(
		private readonly input: NodeJS.ReadableStream & {
			setRawMode?: (mode: boolean) => void;
		},
		private readonly writer: {
			write(text: string): boolean;
		} = process.stdout,
	) {
		input.setRawMode?.(true);
	}

	get hadInterrupt(): boolean {
		return this.interruptedOnce;
	}

	next(): Promise<string | undefined> {
		if (this.done) return Promise.resolve(undefined);
		if (this.input.readable === false) return Promise.resolve(undefined);

		return new Promise<string | undefined>((resolve, reject) => {
			this.pending = { resolve, reject };
			this.input.on("data", this.onData);
			this.input.on("end", this.onEnd);
			this.input.on("error", this.onError);
		});
	}

	close(): void {
		this.detach();
		this.done = true;
		this.input.setRawMode?.(false);
	}

	/** Push an accepted line onto the history stack (deduplicated). */
	remember(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;
		if (this.history[this.history.length - 1] === trimmed) return;
		this.history.push(trimmed);
		if (this.history.length > 200) this.history.shift();
	}

	private readonly onData = (chunk: Buffer | string): void => {
		const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
		// Chunks can batch several key presses; walk characters in order and
		// consume escape sequences (ESC [ final-byte) atomically.
		let index = 0;
		while (index < text.length) {
			if (text[index] === ESC) {
				// CSI sequence: ESC [ followed by parameter/final bytes.
				if (text[index + 1] === "[") {
					const finalByte = text[index + 2];
					if (finalByte !== undefined) {
						this.handleCsi(finalByte);
						index += 3;
						continue;
					}
				}
				// Bare or unknown escape: swallow.
				index += text[index + 1] === "[" ? text.length - index : 1;
				continue;
			}
			const character = text[index];
			if (character === undefined) break;
			if (this.handleCharacter(character)) return;
			index += 1;
		}
	};

	/** Map a CSI final byte to an editor action. */
	private handleCsi(finalByte: string): void {
		switch (finalByte) {
			case "A":
				this.navigateHistory(-1);
				return;
			case "B":
				this.navigateHistory(1);
				return;
			case "C":
				this.moveCursor(Math.min(this.buffer.length, this.cursor + 1));
				return;
			case "D":
				this.moveCursor(Math.max(0, this.cursor - 1));
				return;
			case "H":
				this.moveCursor(0);
				return;
			case "F":
				this.moveCursor(this.buffer.length);
				return;
			default:
			// Other sequences (delete-forward, page keys) are ignored.
		}
	}

	/** Handle one character; returns true when the pending line resolved. */
	private handleCharacter(character: string): boolean {
		switch (character) {
			case CTRL_C:
				if (this.buffer === "") {
					if (this.interruptedOnce) {
						this.writer.write("\n");
						this.finishPending("");
						return true;
					}
					this.interruptedOnce = true;
					this.writer.write("\n(again to exit, or type /exit) ");
				} else {
					// Ctrl-C with text: clear the line like common REPLs.
					this.clearLine();
					this.interruptedOnce = false;
				}
				return false;

			case CTRL_D:
				if (this.buffer === "") {
					this.writer.write("\n");
					this.finishPending(undefined);
					return true;
				}
				this.clearLine();
				return false;

			case ENTER:
			case LF: {
				const line = this.buffer;
				this.buffer = "";
				this.cursor = 0;
				this.historyIndex = this.history.length;
				this.writer.write("\n");
				this.remember(line);
				this.finishPending(line === "" ? undefined : line);
				return true;
			}

			case BACKSPACE:
			case CTRL_H:
				if (this.cursor > 0) {
					this.buffer =
						this.buffer.slice(0, this.cursor - 1) +
						this.buffer.slice(this.cursor);
					this.cursor -= 1;
					this.redrawTail();
				}
				return false;

			default:
				// DEL is handled in the BACKSPACE case above; this guard
				// keeps any other control code out of the buffer.
				if (character < " " || character === "\x7f") return false;
				this.buffer =
					this.buffer.slice(0, this.cursor) +
					character +
					this.buffer.slice(this.cursor);
				this.cursor += 1;
				this.interruptedOnce = false;
				this.redrawTail(character);
				return false;
		}
	}

	/**
	 * Redraw from the cursor to the end of the line, then park the cursor.
	 *
	 * Insertions at the line end need nothing but the character itself.
	 * Mid-line edits rewrite the tail plus one blank cell (which covers the
	 * cells freed by a deletion), then rewind over what was written.
	 */
	private redrawTail(inserted?: string): void {
		const tail = this.buffer.slice(this.cursor);
		if (tail === "") {
			// Cursor at the line end: the echo alone is correct.
			if (inserted) this.writer.write(inserted);
			return;
		}
		const rewind = textWidth(tail) + 1;
		this.writer.write(`${inserted ?? ""}${tail} `);
		this.writer.write(`\x1b[${rewind}D`);
	}

	private moveCursor(position: number): void {
		if (position === this.cursor) return;
		const from = textWidth(this.buffer.slice(0, this.cursor));
		const to = textWidth(this.buffer.slice(0, position));
		const delta = to - from;
		if (delta > 0) this.writer.write(`\x1b[${delta}C`);
		else if (delta < 0) this.writer.write(`\x1b[${-delta}D`);
		this.cursor = position;
	}

	private navigateHistory(direction: -1 | 1): void {
		if (this.history.length === 0) return;
		this.clearLine();
		this.historyIndex += direction;
		if (this.historyIndex < 0) this.historyIndex = 0;
		if (this.historyIndex >= this.history.length) {
			this.historyIndex = this.history.length;
			this.buffer = "";
			this.cursor = 0;
			return;
		}
		this.buffer = this.history[this.historyIndex] ?? "";
		this.cursor = this.buffer.length;
		this.writer.write(this.buffer);
	}

	/** Erase the current input line and park the cursor at its start. */
	private clearLine(): void {
		const cells = textWidth(this.buffer);
		if (cells > 0) {
			this.writer.write(`\r${" ".repeat(cells)}\r`);
		} else {
			this.writer.write("\r");
		}
		this.buffer = "";
		this.cursor = 0;
	}

	private readonly onEnd = (): void => {
		this.detach();
		this.done = true;
		const pending = this.pending;
		this.pending = undefined;
		if (pending) pending.resolve(undefined);
	};

	private readonly onError = (error: Error): void => {
		this.detach();
		this.done = true;
		const pending = this.pending;
		this.pending = undefined;
		if (pending) pending.reject(error);
	};

	private detach(): void {
		this.input.off("data", this.onData);
		this.input.off("end", this.onEnd);
		this.input.off("error", this.onError);
	}

	private finishPending(line: string | undefined): void {
		this.detach();
		const pending = this.pending;
		this.pending = undefined;
		if (pending) pending.resolve(line);
	}
}

/** Reader for piped (non-TTY) stdin: lines arrive already buffered. */
export class PipedLineReader implements LineReader {
	private buffer = "";
	private done = false;
	private pending:
		| {
				resolve: (line: string | undefined) => void;
				reject: (error: Error) => void;
		  }
		| undefined;

	constructor(
		private readonly input: NodeJS.ReadableStream & {
			readableEnded?: boolean;
		} = process.stdin,
	) {}

	next(): Promise<string | undefined> {
		if (this.buffer.includes("\n")) {
			return Promise.resolve(this.takeLine());
		}
		if (this.done) return Promise.resolve(undefined);
		if (this.input.readableEnded) return Promise.resolve(undefined);
		if (this.input.readable === false) return Promise.resolve(undefined);

		return new Promise<string | undefined>((resolve, reject) => {
			this.pending = { resolve, reject };
			this.input.on("data", this.onData);
			this.input.on("end", this.onEnd);
			this.input.on("error", this.onError);
		});
	}

	close(): void {
		this.detach();
		this.done = true;
	}

	private readonly onData = (chunk: Buffer | string): void => {
		const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
		this.buffer += text;
		// Treat CR and CRLF as line breaks so both terminal modes behave
		// identically.
		this.buffer = this.buffer.replace(/\r\n?/g, "\n");

		if (this.pending) {
			if (this.buffer.includes("\n")) {
				this.detach();
				this.pending.resolve(this.takeLine());
				this.pending = undefined;
			}
			return;
		}
	};

	private readonly onEnd = (): void => {
		this.detach();
		this.done = true;
		const pending = this.pending;
		this.pending = undefined;
		if (pending)
			pending.resolve(this.buffer === "" ? undefined : this.takeLine());
	};

	private readonly onError = (error: Error): void => {
		this.detach();
		this.done = true;
		const pending = this.pending;
		this.pending = undefined;
		if (pending) pending.reject(error);
	};

	private detach(): void {
		this.input.off("data", this.onData);
		this.input.off("end", this.onEnd);
		this.input.off("error", this.onError);
	}

	private takeLine(): string | undefined {
		const index = this.buffer.indexOf("\n");
		if (index < 0) {
			const line = this.buffer;
			this.buffer = "";
			return line === "" ? undefined : line;
		}
		const line = this.buffer.slice(0, index);
		this.buffer = this.buffer.slice(index + 1);
		return line;
	}
}

export interface ReadLineResult {
	/** `exit` when the input loop should stop. */
	kind: "exit" | "input";
	/** The composed message: single line, or joined multi-line block. */
	text?: string;
}

/**
 * Read one user input — a single line, or a multi-line block started with a
 * trailing backslash — resolving `exit` on the interrupt convention or an
 * explicit stop word.
 */
export async function readMessage(
	reader: LineReader,
	onEof: () => void = () => {},
): Promise<ReadLineResult> {
	const first = await reader.next();
	if (first === undefined) {
		onEof();
		return { kind: "exit" };
	}

	// A trailing backslash opens a multi-line block, terminated by an empty
	// line. The backslash itself is dropped.
	if (first.endsWith("\\")) {
		const lines: string[] = [first.slice(0, -1)];
		for (;;) {
			const next = await reader.next();
			if (next === undefined) break;
			if (next === "") break;
			lines.push(next);
		}
		return { kind: "input", text: lines.join("\n") };
	}

	return { kind: "input", text: first };
}

/** Split a raw input line into a slash command and its argument text. */
export function parseSlashCommand(
	line: string,
): { name: string; rest: string } | undefined {
	const trimmed = line.trim();
	if (!trimmed.startsWith("/")) return undefined;
	const body = trimmed.slice(1).trim();
	if (!body) return undefined;
	const space = body.search(/\s/);
	const name = space < 0 ? body : body.slice(0, space);
	const rest = space < 0 ? "" : body.slice(space + 1).trim();
	return { name, rest };
}
