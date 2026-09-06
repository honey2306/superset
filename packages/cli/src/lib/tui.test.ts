import { describe, expect, test } from "bun:test";
import { ansi, Screen } from "./tui";

const ESC = String.fromCharCode(27);

/** Collects writes so a test can assert on exactly what hit the terminal. */
function fakeOut(columns = 80, rows = 24) {
	const writes: string[] = [];
	return {
		writes,
		columns,
		rows,
		write(text: string): boolean {
			writes.push(text);
			return true;
		},
	};
}

describe("Screen", () => {
	test("第一帧清屏并写出所有行", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const frame = screen.begin();
		frame.print("alpha");
		frame.print("beta");
		screen.commit(frame);

		const output = out.writes.join("");
		expect(output).toContain(ansi.clear);
		expect(output).toContain(`${ESC}[1;1H${ESC}[2Kalpha`);
		expect(output).toContain(`${ESC}[2;1H${ESC}[2Kbeta`);
	});

	test("第二帧只重写发生变化的行", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const first = screen.begin();
		first.print("alpha");
		first.print("beta");
		screen.commit(first);
		out.writes.length = 0;

		const second = screen.begin();
		second.print("alpha");
		second.print("BETA");
		screen.commit(second);

		const output = out.writes.join("");
		expect(output).toContain(`${ESC}[2;1H${ESC}[2KBETA`);
		// The unchanged row must not be repositioned or rewritten: that byte
		// budget is what keeps a repaint from blocking on a slow terminal.
		expect(output).not.toContain("alpha");
		expect(output).not.toContain(ansi.clear);
	});

	test("行数变少时清掉多余的旧行", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const first = screen.begin();
		first.print("one");
		first.print("two");
		first.print("three");
		screen.commit(first);
		out.writes.length = 0;

		const second = screen.begin();
		second.print("one");
		screen.commit(second);

		const output = out.writes.join("");
		expect(output).toContain(`${ESC}[2;1H${ESC}[2K`);
		expect(output).toContain(`${ESC}[3;1H${ESC}[2K`);
		expect(output).not.toContain("two");
	});

	test("终端尺寸变化时整屏重绘", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const first = screen.begin();
		first.print("alpha");
		screen.commit(first);
		out.writes.length = 0;

		out.rows = 40;
		const second = screen.begin();
		second.print("alpha");
		screen.commit(second);

		const output = out.writes.join("");
		expect(output).toContain(ansi.clear);
		expect(output).toContain(`${ESC}[1;1H${ESC}[2Kalpha`);
	});

	test("invalidate 强制下一帧整屏重绘", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const first = screen.begin();
		first.print("alpha");
		screen.commit(first);
		screen.invalidate();
		out.writes.length = 0;

		const second = screen.begin();
		second.print("alpha");
		screen.commit(second);

		expect(out.writes.join("")).toContain(ansi.clear);
	});

	test("有光标目标时定位并显示光标，否则隐藏", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const withCursor = screen.begin();
		withCursor.print("alpha");
		withCursor.setCursorTarget(3, 7);
		screen.commit(withCursor);
		expect(out.writes.join("")).toContain(`${ESC}[4;8H${ansi.showCursor}`);

		out.writes.length = 0;
		const withoutCursor = screen.begin();
		withoutCursor.print("beta");
		screen.commit(withoutCursor);
		const output = out.writes.join("");
		expect(output).toContain(ansi.hideCursor);
		expect(output).not.toContain(ansi.showCursor);
	});

	test("整帧只发生一次写入", () => {
		const out = fakeOut();
		const screen = new Screen(out);
		const frame = screen.begin();
		for (let row = 0; row < 30; row += 1) frame.print(`row-${row}`);
		frame.setCursorTarget(1, 1);
		screen.commit(frame);

		// One syscall per frame: interleaved writes are what let a slow pty
		// stall the event loop mid-repaint.
		expect(out.writes).toHaveLength(1);
	});
});

describe("Frame", () => {
	test("rowCount 反映已追加的行数，供视图计算光标行", () => {
		const screen = new Screen(fakeOut());
		const frame = screen.begin();
		expect(frame.rowCount).toBe(0);
		frame.print("a");
		frame.print();
		expect(frame.rowCount).toBe(2);
		expect(frame.content).toEqual(["a", ""]);
	});
});
