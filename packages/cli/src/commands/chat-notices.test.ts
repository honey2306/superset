import { expect, test } from "bun:test";
import { noticeLines } from "./chat";

test("routine notices do not render or reserve space above the composer", () => {
	for (const tone of ["info", "success"] as const) {
		for (const text of [
			"消息已提交",
			"已切换到 codex/extract-engineering-tools",
			"正在提交消息…",
		]) {
			expect(noticeLines({ notice: { text, tone } })).toEqual([]);
		}
	}
	expect(noticeLines({ notice: undefined })).toEqual([]);
});

test("warnings remain visible", () => {
	expect(
		noticeLines({ notice: { text: "连接失败", tone: "warning" } }).join("\n"),
	).toContain("连接失败");
});
