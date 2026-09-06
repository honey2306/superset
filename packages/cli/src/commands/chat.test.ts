import { describe, expect, test } from "bun:test";
import { caretPosition, wrapComposer } from "./chat";

/** Caret coordinates for a draft, as the composer would compute them. */
function locate(text: string, cursor: number, width: number) {
	const rows = wrapComposer(text, width);
	return caretPosition(rows, text, cursor);
}

describe("wrapComposer", () => {
	test("单行文本占一行，起点为 0", () => {
		expect(wrapComposer("hello", 20)).toEqual([{ text: "hello", start: 0 }]);
	});

	test("空文本仍产生一行，让光标有落点", () => {
		expect(wrapComposer("", 20)).toEqual([{ text: "", start: 0 }]);
	});

	test("显式换行分行，且偏移跳过换行符本身", () => {
		expect(wrapComposer("ab\ncd", 20)).toEqual([
			{ text: "ab", start: 0 },
			{ text: "cd", start: 3 },
		]);
	});

	test("超宽硬折行，偏移指向该行首字符在 buffer 中的位置", () => {
		expect(wrapComposer("abcdef", 3)).toEqual([
			{ text: "abc", start: 0 },
			{ text: "def", start: 3 },
		]);
	});

	test("CJK 按两列计宽折行", () => {
		expect(wrapComposer("中文字", 4)).toEqual([
			{ text: "中文", start: 0 },
			{ text: "字", start: 2 },
		]);
	});
});

describe("caretPosition", () => {
	test("行内位置换算为列宽", () => {
		expect(locate("hello", 3, 20)).toEqual({ row: 0, column: 3 });
	});

	test("CJK 之后的列数按两倍宽计算", () => {
		expect(locate("中文x", 2, 20)).toEqual({ row: 0, column: 4 });
	});

	test("换行之后的光标落在下一行行首", () => {
		expect(locate("ab\ncd", 3, 20)).toEqual({ row: 1, column: 0 });
	});

	test("折行边界上的光标显示在新行行首，而不是上一行行尾", () => {
		expect(locate("abcdef", 3, 3)).toEqual({ row: 1, column: 0 });
	});

	test("末尾光标停在最后一行的末尾", () => {
		expect(locate("ab\ncd", 5, 20)).toEqual({ row: 1, column: 2 });
	});
});
