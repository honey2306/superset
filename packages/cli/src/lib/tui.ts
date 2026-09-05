/**
 * Full-screen TUI primitives for the interactive CLI.
 *
 * Mirrors the validated prototype's rendering model: each frame clears the
 * screen, prints the view top-to-bottom while counting rows, then parks the
 * cursor at a view-chosen input position. Keeping the loop in one owner means
 * views only describe content, never terminal state.
 */

const ESC = String.fromCharCode(27);

export const ansi = {
	clear: `${ESC}[2J${ESC}[H`,
	hideCursor: `${ESC}[?25l`,
	showCursor: `${ESC}[?25h`,
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

/**
 * Frame renderer bound to one output stream.
 *
 * A frame is opened (screen cleared, cursor hidden), drawn via `print` /
 * `setCursorTarget`, and closed (cursor parked). Views receive the open frame
 * and stay oblivious to the terminal.
 */
export class Frame {
	private rows = 0;
	private target: CursorTarget | undefined;

	constructor(private readonly out: { write(text: string): boolean }) {}

	static open(out: { write(text: string): boolean }): Frame {
		const frame = new Frame(out);
		out.write(`${ansi.hideCursor}${ansi.clear}`);
		return frame;
	}

	print(text = ""): void {
		this.rows += 1;
		this.out.write(`${text}\n`);
	}

	setCursorTarget(row: number, column: number): void {
		this.target = { row, column };
	}

	/** Rows printed so far — views use this to compute target rows. */
	get rowCount(): number {
		return this.rows;
	}

	close(): void {
		if (this.target) {
			this.out.write(
				`${ESC}[${this.target.row + 1};${this.target.column + 1}H${ansi.showCursor}`,
			);
			return;
		}
		this.out.write(ansi.hideCursor);
	}
}
