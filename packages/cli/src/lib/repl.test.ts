import { describe, expect, it } from "bun:test";
import { Readable } from "node:stream";
import {
	PipedLineReader,
	parseSlashCommand,
	RawModeLineEditor,
	readMessage,
} from "./repl";

describe("parseSlashCommand", () => {
	it("returns undefined for plain text", () => {
		expect(parseSlashCommand("hello world")).toBeUndefined();
	});

	it("splits name and rest", () => {
		expect(parseSlashCommand("/resume abc123")).toEqual({
			name: "resume",
			rest: "abc123",
		});
	});

	it("handles bare commands", () => {
		expect(parseSlashCommand("/sessions")).toEqual({
			name: "sessions",
			rest: "",
		});
	});

	it("trims surrounding whitespace", () => {
		expect(parseSlashCommand("  /sessions ")).toEqual({
			name: "sessions",
			rest: "",
		});
	});
});

/** Reader fed from a fixed list of lines. */
function fakeReader(lines: string[]) {
	let index = 0;
	return {
		next: async () => lines[index++] as string | undefined,
	};
}

describe("readMessage", () => {
	it("returns a single line as-is", async () => {
		const result = await readMessage(fakeReader(["hello"]));
		expect(result).toEqual({ kind: "input", text: "hello" });
	});

	it("joins multi-line blocks opened with a trailing backslash", async () => {
		const result = await readMessage(
			fakeReader(["first\\", "second", "third", "", "after"]),
		);
		expect(result).toEqual({ kind: "input", text: "first\nsecond\nthird" });
	});

	it("ends the block at end of input", async () => {
		const result = await readMessage(fakeReader(["first\\", "second"]));
		expect(result).toEqual({ kind: "input", text: "first\nsecond" });
	});

	it("reports exit at end of input", async () => {
		let eof = false;
		const result = await readMessage(fakeReader([]), () => {
			eof = true;
		});
		expect(result.kind).toBe("exit");
		expect(eof).toBe(true);
	});
});

describe("PipedLineReader", () => {
	it("yields buffered lines in order and stops at end of stream", async () => {
		const stream = new Readable({
			read() {},
		}) as NodeJS.ReadableStream & { push(chunk: string | null): boolean };
		const reader = new PipedLineReader(stream);

		const first = reader.next();
		stream.push("one\ntwo\n");
		expect(await first).toBe("one");
		expect(await reader.next()).toBe("two");

		const last = reader.next();
		stream.push("tail");
		stream.push(null);
		// The trailing chunk without a newline is still delivered.
		expect(await last).toBe("tail");
		expect(await reader.next()).toBeUndefined();
	});
});

/** A minimal pushable stream shaped like raw-mode stdin. */
function pushableInput() {
	return new Readable({
		read() {},
	}) as unknown as NodeJS.ReadableStream & {
		push(chunk: string | null): boolean;
		setRawMode(mode: boolean): void;
	};
}

/** A stdout double that records writes. */
function recordingOutput() {
	const written: string[] = [];
	return {
		written,
		write(text: string) {
			written.push(text);
			return true;
		},
	};
}

describe("RawModeLineEditor", () => {
	it("echoes typed characters and resolves the line on enter", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("hi\r");
		expect(await line).toBe("hi");
		// Echo of the two characters, then the newline.
		expect(output.written.join("")).toContain("hi");
		expect(output.written.join("").endsWith("\n")).toBe(true);
		editor.close();
	});

	it("erases echoed characters on backspace", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("ab\x7f\r");
		expect(await line).toBe("a");
		// Echo happens via the tail redraw path; the newline ends the line.
		const echo = output.written.join("");
		expect(echo).toContain("a");
		editor.close();
	});

	it("erases wide characters with two cells", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("你\x7f\r");
		expect(await line).toBeUndefined();
		editor.close();
	});

	it("inserts characters in the middle of the line", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		// Type "ad", jump to start (Home), then insert "bc" before the tail.
		input.push("ad\x1b[Hbc\r");
		expect(await line).toBe("bcad");
		editor.close();
	});

	it("moves the cursor left and inserts", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		// Type "ad", one left arrow, then insert "c" between them.
		input.push("ad\x1b[Dc\r");
		expect(await line).toBe("acd");
		editor.close();
	});

	it("backspace at the start of the line does nothing", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		// Type "ab", Home (cursor at 0), backspace has nothing before it.
		input.push("ab\x1b[H\x7f\r");
		expect(await line).toBe("ab");
		editor.close();
	});

	it("backspace mid-line deletes the character before the cursor", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		// Type "ab", Home, right arrow (cursor on "b"), backspace removes "a".
		input.push("ab\x1b[H\x1b[C\x7f\r");
		expect(await line).toBe("b");
		editor.close();
	});

	it("End jumps to the line end", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		// Type "ab", Home, End, then append "c".
		input.push("ab\x1b[H\x1b[Fc\r");
		expect(await line).toBe("abc");
		editor.close();
	});

	it("left arrow does not move past the start", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("\x1b[D\x1b[Dab\r");
		expect(await line).toBe("ab");
		editor.close();
	});

	it("navigates history with arrow keys", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const first = editor.next();
		input.push("first\r");
		await first;

		const second = editor.next();
		// Up arrow recalls "first", then backspace drops its last char.
		input.push("\x1b[A\x7f\r");
		expect(await second).toBe("firs");
		editor.close();
	});

	it("Ctrl-C once warns, twice exits", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("\x03");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(editor.hadInterrupt).toBe(true);
		expect(output.written.join("")).toContain("again to exit");

		input.push("\x03");
		expect(await line).toBe("");
		editor.close();
	});

	it("Ctrl-C with text discards the line", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("abc\x03\r");
		// Ctrl-C cleared the buffer, so the enter submits an empty line.
		expect(await line).toBeUndefined();
		const next = editor.next();
		input.push("new\r");
		expect(await next).toBe("new");
		expect(editor.hadInterrupt).toBe(false);
		editor.close();
	});

	it("Ctrl-D on an empty line ends input", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		input.push("\x04");
		expect(await line).toBeUndefined();
		editor.close();
	});

	it("Home then typing inserts at the start", async () => {
		const input = pushableInput();
		const output = recordingOutput();
		const editor = new RawModeLineEditor(input, output);

		const line = editor.next();
		// Home, ignored historically, now moves; text lands before "ok".
		input.push("\x1b[Hok\r");
		expect(await line).toBe("ok");
		editor.close();
	});
});
