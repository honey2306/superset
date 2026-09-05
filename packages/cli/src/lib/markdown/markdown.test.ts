import { describe, expect, test } from "bun:test";
import { displayWidth, stripAnsi } from "../output";
import { renderMarkdown } from "./markdown";
import { noColorMarkdownTheme } from "./theme";

/** 渲染并剥掉 ANSI，只看可见文本。 */
const visible = (source: string, width = 80): string[] =>
	renderMarkdown(source, width).map(stripAnsi);

describe("标题", () => {
	test("h1/h2 不显示井号，h3 起显示着色前缀", () => {
		const lines = renderMarkdown("# 顶级\n## 次级\n### 三级\n#### 四级", 80);
		expect(visible("# 顶级\n## 次级\n### 三级\n#### 四级", 80)).toEqual([
			" 顶级",
			"",
			" 次级",
			"",
			" ### 三级",
			"",
			" #### 四级",
		]);
		// h1：heading 色 + 粗体 + 下划线；h2：heading 色 + 粗体（无下划线）
		const h1 = lines[0] ?? "";
		expect(h1).toContain("\x1b[38;2;240;198;116m");
		expect(h1).toContain("\x1b[1m");
		expect(h1).toContain("\x1b[4m");
		const h2 = lines[2] ?? "";
		expect(h2).toContain("\x1b[1m");
		expect(h2).not.toContain("\x1b[4m");
		const h3 = lines[4] ?? "";
		// 前缀与文字都是 heading 色
		expect(h3.startsWith(" \x1b[38;2;240;198;116m\x1b[1m### ")).toBe(true);
	});
});

describe("列表", () => {
	test("无序 marker 是 '- ' 且着 listBullet 色", () => {
		const lines = renderMarkdown("- 甲\n- 乙", 80);
		expect(lines.map(stripAnsi)).toEqual([" - 甲", " - 乙"]);
		expect(lines[0]).toContain("\x1b[38;2;138;190;183m- \x1b[39m甲");
	});

	test("每层嵌套缩进 4 空格（再加页面边距 1 列）", () => {
		expect(visible("- 甲\n  - 乙\n    - 丙", 80)).toEqual([
			" - 甲",
			"     - 乙", // 1 边距 + 4 缩进
			"         - 丙", // 1 边距 + 8 缩进
		]);
	});

	test("有序列表按 token.start 递增", () => {
		expect(visible("3. 三\n4. 四", 80)).toEqual([" 3. 三", " 4. 四"]);
	});

	test("任务列表保留 [x]/[ ] 标记", () => {
		expect(visible("- [x] 已做\n- [ ] 待做", 80)).toEqual([
			" - [x] 已做",
			" - [ ] 待做",
		]);
	});

	test("松弛列表项间有空行，紧凑列表没有", () => {
		expect(visible("- 甲\n- 乙", 80)).toEqual([" - 甲", " - 乙"]);
		expect(visible("- 甲\n\n- 乙", 80)).toEqual([" - 甲", "", " - 乙"]);
	});

	test("折行续行与首行文字对齐", () => {
		const lines = visible("- 这是一条会被折成两行的很长很长的列表项内容啊", 20);
		expect(lines.length).toBeGreaterThan(1);
		expect(lines[1]?.startsWith("   ")).toBe(true); // 续行缩进 = marker 宽 2
		for (const line of lines)
			expect(displayWidth(line)).toBeLessThanOrEqual(20);
	});
});

describe("行内样式", () => {
	test("行内代码只着色，不加反引号", () => {
		const lines = renderMarkdown("使用 `foo` 变量", 80);
		expect(lines.map(stripAnsi)).toEqual([" 使用 foo 变量"]);
		expect(lines[0]).toContain("\x1b[38;2;138;190;183mfoo\x1b[39m");
		expect(lines[0]).not.toContain("`");
	});

	test("粗体 1/22、斜体 3/23、删除线 9/29", () => {
		const line = renderMarkdown("**粗** *斜* ~~删~~", 80)[0] ?? "";
		expect(line).toContain("\x1b[1m粗\x1b[22m");
		expect(line).toContain("\x1b[3m斜\x1b[23m");
		expect(line).toContain("\x1b[9m删\x1b[29m");
	});

	test("链接文字与 href 不同时追加 (URL)", () => {
		const lines = renderMarkdown(
			"[官网](https://example.com) 与 <https://auto.link>",
			80,
		);
		expect(lines.map(stripAnsi)).toEqual([
			" 官网 (https://example.com) 与 https://auto.link",
		]);
		expect(lines[0]).toContain("\x1b[38;2;129;162;190m");
		expect(lines[0]).toContain("\x1b[38;2;102;102;102m (https://example.com)");
		// autolink 文字与 href 相同，不追加 (URL)
		expect(stripAnsi(lines[0] ?? "")).not.toContain(" (https://auto.link)");
	});
});

describe("代码块", () => {
	test("首尾 fence 着边框色，正文缩进 2 空格", () => {
		const lines = renderMarkdown("```\nplain code\n```", 80);
		expect(lines.map(stripAnsi)).toEqual([" ```", "   plain code", " ```"]);
		expect(lines[0]).toContain("\x1b[38;2;128;128;128m```");
		expect(lines[2]).toContain("\x1b[38;2;128;128;128m```");
	});

	test("有效语言会语法高亮", () => {
		const lines = renderMarkdown("```ts\nconst a = 1;\n```", 80);
		expect(stripAnsi(lines[1] ?? "")).toBe("   const a = 1;");
		// keyword (#569CD6) 着色
		expect(lines[1]).toContain("\x1b[38;2;86;156;214mconst\x1b[39m");
	});

	test("无效语言不做自动检测，整体 codeBlock 单色", () => {
		const lines = renderMarkdown("```notalang\nplain text here\n```", 80);
		// 缩进在颜色外：边距 1 + 缩进 2 + 着色正文
		expect(lines[1]).toBe("   \x1b[38;2;181;189;104mplain text here\x1b[39m");
		expect(lines[1]).not.toContain("\x1b[38;2;86;156;214m");
	});

	test("operator scope 正常着色（回归保护：该键不在 cli-highlight Theme 类型里）", () => {
		const lines = renderMarkdown("```swift\nint x = (1 + 2) * 3;\n```", 80);
		// Swift 语法把运算符包成 operator scope，颜色映射为 #D4D4D4
		expect(lines[1]).toContain("\x1b[38;2;212;212;212m=\x1b[39m");
		expect(lines[1]).toContain("\x1b[38;2;212;212;212m+\x1b[39m");
	});
});

describe("引用块", () => {
	test("前缀 '│ ' 着边框色，内容为 quote 色 + 斜体", () => {
		const lines = renderMarkdown("> 引用内容", 80);
		expect(lines.map(stripAnsi)).toEqual([" │ 引用内容"]);
		expect(lines[0]).toContain("\x1b[38;2;128;128;128m│ \x1b[39m");
		expect(lines[0]).toContain("\x1b[3m引用内容\x1b[23m");
	});
});

describe("水平线", () => {
	test("最多 80 列，随可用宽度截断", () => {
		const wide = renderMarkdown("---", 100);
		expect(wide.length).toBe(1);
		expect(stripAnsi(wide[0] ?? "")).toBe(` ${"─".repeat(80)}`);
		// 折行宽度 = 40 - 左右边距 2 = 38
		const narrow = renderMarkdown("---", 40);
		expect(stripAnsi(narrow[0] ?? "")).toBe(` ${"─".repeat(38)}`);
		expect(narrow[0]).toContain("\x1b[38;2;128;128;128m");
	});
});

describe("表格", () => {
	test("完整框线，每对数据行之间都有分隔线", () => {
		const lines = renderMarkdown(
			"| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |",
			80,
		);
		// 列宽按内容自然宽度：甲/乙 各 2 列，数字补空格对齐
		expect(lines.map(stripAnsi)).toEqual([
			" ┌────┬────┐",
			" │ 甲 │ 乙 │",
			" ├────┼────┤",
			" │ 1  │ 2  │",
			" ├────┼────┤",
			" │ 3  │ 4  │",
			" └────┴────┘",
		]);
		// 表头粗体
		expect(lines[1]).toContain("\x1b[1m甲");
		expect(lines[3]).not.toContain("\x1b[1m1");
	});
});

describe("块间距与折行", () => {
	test("连续源码空行合并为恰好一个空行", () => {
		expect(visible("第一段\n\n\n\n\n第二段", 80)).toEqual([
			" 第一段",
			"",
			" 第二段",
		]);
	});

	test("段落后紧跟列表时不加空行", () => {
		expect(visible("引导：\n- 项甲\n- 项乙", 80)).toEqual([
			" 引导：",
			" - 项甲",
			" - 项乙",
		]);
	});

	test("Tab 替换为 3 空格", () => {
		expect(visible("a\tb", 80)).toEqual([" a   b"]);
	});

	test("CJK 宽字符按 2 列折行，不超宽且不丢内容", () => {
		const source = "这是一段用于测试折行行为的中文长文本内容";
		const lines = renderMarkdown(source, 16, {
			theme: noColorMarkdownTheme,
			paddingX: 0, // contentWidth = 16
		});
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(displayWidth(line)).toBeLessThanOrEqual(16);
		}
		expect(lines.join("")).toBe(source);
	});

	test("超长 ASCII 单词逐字符硬折", () => {
		const lines = renderMarkdown("supercalifragilisticexpialidocious", 12, {
			paddingX: 0, // contentWidth = 12
		});
		for (const line of lines) {
			expect(displayWidth(line)).toBeLessThanOrEqual(12);
		}
		expect(lines.map(stripAnsi).join("")).toBe(
			"supercalifragilisticexpialidocious",
		);
	});
});

describe("无色模式", () => {
	test("noColor 主题输出不含任何 ANSI 码", () => {
		const lines = renderMarkdown(
			"# 标题\n\n**粗** `码` ~~删~~ [链](https://x.example)\n\n> 引用\n\n---\n\n```ts\nconst a = 1;\n```\n\n| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n\n- 列表\n- 项",
			80,
			{ theme: noColorMarkdownTheme },
		);
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) expect(line.includes("\x1b")).toBe(false);
	});

	test("color: false 强制无色，优先于主题选择", () => {
		const lines = renderMarkdown("# 标题 `code`", 80, { color: false });
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) expect(line.includes("\x1b")).toBe(false);
		const colored = renderMarkdown("# 标题", 80, { color: true });
		expect(colored[0]).toContain("\x1b[38;2;240;198;116m");
	});
});

describe("空输入与留白", () => {
	test("空白源码不产生任何行", () => {
		expect(renderMarkdown("", 80)).toEqual([]);
		expect(renderMarkdown("   \n\n  ", 80)).toEqual([]);
	});

	test("paddingX=0 时不加左边距", () => {
		const lines = renderMarkdown("文本", 80, { paddingX: 0 });
		expect(lines.map(stripAnsi)).toEqual(["文本"]);
	});
});
