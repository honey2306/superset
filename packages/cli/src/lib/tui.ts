/**
 * Full-screen TUI primitives for the interactive CLI.
 *
 * Views describe a frame as a list of lines plus a cursor position; `Screen`
 * turns consecutive frames into the smallest possible terminal write by
 * diffing against what is already on screen.
 *
 * The diff is not a micro-optimisation. Bun's writes to a pty block the event
 * loop when the terminal is slow to drain, and a blocked loop also stalls the
 * in-flight HTTP and WebSocket traffic that feeds this UI. Clearing and
 * repainting the whole screen every frame pushed kilobytes per keystroke and
 * could freeze the app for seconds; rewriting only changed rows keeps a
 * typical frame down to a few dozen bytes, and removes the flicker that comes
 * with a full clear.
 */

const ESC = String.fromCharCode(27);

export const ansi = {
	clear: `${ESC}[2J${ESC}[H`,
	hideCursor: `${ESC}[?25l`,
	showCursor: `${ESC}[?25h`,
	/** Switch to the terminal's alternate screen buffer (like vim/less). */
	enterAltScreen: `${ESC}[?1049h`,
	/** Restore the primary screen buffer and its prior scrollback content. */
	exitAltScreen: `${ESC}[?1049l`,
	/** Ask the terminal to bracket pasted text with paste-start/end markers. */
	enableBracketedPaste: `${ESC}[?2004h`,
	disableBracketedPaste: `${ESC}[?2004l`,
	bold: `${ESC}[1m`,
	dim: `${ESC}[2m`,
	italic: `${ESC}[3m`,
	underline: `${ESC}[4m`,
	reset: `${ESC}[0m`,
	cyan: `${ESC}[36m`,
	green: `${ESC}[32m`,
	yellow: `${ESC}[33m`,
	red: `${ESC}[31m`,
	magenta: `${ESC}[35m`,
	gray: `${ESC}[90m`,
} as const;

export interface CursorTarget {
	row: number;
	column: number;
}

export interface OutputStream {
	write(text: string): boolean;
	columns?: number;
	rows?: number;
}

/**
 * One frame under construction.
 *
 * Views only append lines and mark where the caret belongs; they never touch
 * the terminal, so the same view code works for the diffing renderer and for
 * tests that inspect the produced lines.
 */
export class Frame {
	private readonly lines: string[] = [];
	private target: CursorTarget | undefined;

	print(text = ""): void {
		this.lines.push(text);
	}

	setCursorTarget(row: number, column: number): void {
		this.target = { row, column };
	}

	/** Rows appended so far — views use this to compute target rows. */
	get rowCount(): number {
		return this.lines.length;
	}

	get content(): readonly string[] {
		return this.lines;
	}

	get cursor(): CursorTarget | undefined {
		return this.target;
	}
}

/**
 * Owns what is currently on the terminal and applies frames as diffs.
 */
export class Screen {
	private previous: string[] = [];
	private columns: number | undefined;
	private rows: number | undefined;

	constructor(private readonly out: OutputStream) {}

	/** Begin a frame; pass it to `commit` when the view has filled it. */
	begin(): Frame {
		return new Frame();
	}

	/**
	 * Write the difference between `frame` and the current screen.
	 *
	 * Rows are addressed absolutely and no newline is ever emitted, so the
	 * screen cannot scroll out from under the absolute cursor positioning.
	 */
	commit(frame: Frame): void {
		const lines = frame.content;
		let output = "";

		// A resize invalidates every remembered row: start from a clean screen.
		if (this.out.columns !== this.columns || this.out.rows !== this.rows) {
			this.columns = this.out.columns;
			this.rows = this.out.rows;
			this.previous = [];
			output += ansi.clear;
		}

		output += ansi.hideCursor;
		const rowCount = Math.max(lines.length, this.previous.length);
		for (let row = 0; row < rowCount; row += 1) {
			const next = lines[row] ?? "";
			if (next === this.previous[row]) continue;
			// Clear the row before rewriting so shorter content cannot leave
			// stale characters behind.
			output += `${ESC}[${row + 1};1H${ESC}[2K${next}`;
		}
		this.previous = [...lines];

		const cursor = frame.cursor;
		output += cursor
			? `${ESC}[${cursor.row + 1};${cursor.column + 1}H${ansi.showCursor}`
			: ansi.hideCursor;
		this.out.write(output);
	}

	/** Forget the on-screen state, forcing the next commit to repaint fully. */
	invalidate(): void {
		this.previous = [];
		this.columns = undefined;
		this.rows = undefined;
	}
}
