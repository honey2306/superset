/**
 * 终端 Markdown 渲染主题。
 *
 * 取值移植自 Pi 终端的 dark 主题（dark.json）：颜色统一走 truecolor
 * 前景码 `ESC[38;2;R;G;Bm … ESC[39m`。所有主题函数都可以被替换为恒等
 * 函数（见 noColorMarkdownTheme），以支持 --no-color / 管道输出纯文本。
 */
import {
	type Theme as HighlightTheme,
	highlight,
	supportsLanguage,
} from "cli-highlight";

/** 单个样式函数：接收文本，返回带 ANSI 码的文本。 */
export type MarkdownStyleFn = (text: string) => string;

/** Markdown 语义颜色的十六进制取值（如 "#f0c674"）。 */
export interface MarkdownColors {
	heading: string;
	link: string;
	linkUrl: string;
	code: string;
	codeBlock: string;
	codeBlockBorder: string;
	quote: string;
	quoteBorder: string;
	hr: string;
	listBullet: string;
}

export interface MarkdownTheme {
	heading: MarkdownStyleFn;
	link: MarkdownStyleFn;
	linkUrl: MarkdownStyleFn;
	code: MarkdownStyleFn;
	codeBlock: MarkdownStyleFn;
	codeBlockBorder: MarkdownStyleFn;
	quote: MarkdownStyleFn;
	quoteBorder: MarkdownStyleFn;
	hr: MarkdownStyleFn;
	listBullet: MarkdownStyleFn;
	bold: MarkdownStyleFn;
	italic: MarkdownStyleFn;
	underline: MarkdownStyleFn;
	strikethrough: MarkdownStyleFn;
	/** 语法高亮，返回逐行结果；语言无效或未指定时整体用 codeBlock 单色。 */
	highlightCode: (code: string, lang?: string) => string[];
	/** 代码块正文每行缩进，默认两个空格。 */
	codeBlockIndent?: string;
}

/** Pi dark 主题中 markdown 语义色的真实取值。 */
export const DARK_MARKDOWN_COLORS: MarkdownColors = {
	heading: "#f0c674",
	link: "#81a2be",
	linkUrl: "#666666",
	code: "#8abeb7",
	codeBlock: "#b5bd68",
	codeBlockBorder: "#808080",
	quote: "#808080",
	quoteBorder: "#808080",
	hr: "#808080",
	listBullet: "#8abeb7",
};

/** Pi dark 主题的语法高亮取值（buildCliHighlightTheme 的映射目标）。 */
const SYNTAX_COLORS = {
	keyword: "#569CD6",
	type: "#4EC9B0",
	number: "#B5CEA8",
	string: "#CE9178",
	comment: "#6A9955",
	muted: "#808080",
	function: "#DCDCAA",
	punctuation: "#D4D4D4",
	variable: "#9CDCFE",
	operator: "#D4D4D4",
	addition: "#b5bd68",
	deletion: "#cc6666",
} as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
	return {
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
	};
}

/** truecolor 前景色：`ESC[38;2;R;G;Bm` + 文本 + `ESC[39m`（只重置前景）。 */
function foreground(hex: string, text: string): string {
	const { r, g, b } = hexToRgb(hex);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** 粗体用 1/22、斜体 3/23、下划线 4/24、删除线 9/29 —— 单独成对开关。 */
const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`;
const italic = (text: string): string => `\x1b[3m${text}\x1b[23m`;
const underline = (text: string): string => `\x1b[4m${text}\x1b[24m`;
const strikethrough = (text: string): string => `\x1b[9m${text}\x1b[29m`;

/**
 * 移植 Pi 的 buildCliHighlightTheme：cli-highlight token 到主题函数的 25 项映射。
 *
 * cli-highlight 的 Theme 类型只列出 highlight.js 默认注册的固定 token 名，
 * 但其渲染器按名动态查找（theme[token] || DEFAULT_THEME[token] || plain），
 * 而 `operator`/`punctuation` 是十余个语言定义真实产出的 scope——保留这两个键
 * 并给所有参数显式标注类型，用宽 Record 在此处收住类型，传给 highlight()
 * 时再断言一次；删除这两个键会让这些语言的运算符/标点静默失去着色。
 */
function buildSyntaxTheme(fg: (hex: string, text: string) => string) {
	return {
		keyword: (s: string) => fg(SYNTAX_COLORS.keyword, s),
		built_in: (s: string) => fg(SYNTAX_COLORS.type, s),
		literal: (s: string) => fg(SYNTAX_COLORS.number, s),
		number: (s: string) => fg(SYNTAX_COLORS.number, s),
		regexp: (s: string) => fg(SYNTAX_COLORS.string, s),
		string: (s: string) => fg(SYNTAX_COLORS.string, s),
		comment: (s: string) => fg(SYNTAX_COLORS.comment, s),
		doctag: (s: string) => fg(SYNTAX_COLORS.comment, s),
		meta: (s: string) => fg(SYNTAX_COLORS.muted, s),
		function: (s: string) => fg(SYNTAX_COLORS.function, s),
		title: (s: string) => fg(SYNTAX_COLORS.function, s),
		class: (s: string) => fg(SYNTAX_COLORS.type, s),
		type: (s: string) => fg(SYNTAX_COLORS.type, s),
		tag: (s: string) => fg(SYNTAX_COLORS.punctuation, s),
		name: (s: string) => fg(SYNTAX_COLORS.keyword, s),
		attr: (s: string) => fg(SYNTAX_COLORS.variable, s),
		variable: (s: string) => fg(SYNTAX_COLORS.variable, s),
		params: (s: string) => fg(SYNTAX_COLORS.variable, s),
		operator: (s: string) => fg(SYNTAX_COLORS.operator, s),
		punctuation: (s: string) => fg(SYNTAX_COLORS.punctuation, s),
		emphasis: italic,
		strong: bold,
		link: underline,
		addition: (s: string) => fg(SYNTAX_COLORS.addition, s),
		deletion: (s: string) => fg(SYNTAX_COLORS.deletion, s),
	} satisfies Record<string, (s: string) => string>;
}

/** 由语义色构建 truecolor 主题。 */
export function createMarkdownTheme(colors: MarkdownColors): MarkdownTheme {
	return {
		heading: (text) => foreground(colors.heading, text),
		link: (text) => foreground(colors.link, text),
		linkUrl: (text) => foreground(colors.linkUrl, text),
		code: (text) => foreground(colors.code, text),
		codeBlock: (text) => foreground(colors.codeBlock, text),
		codeBlockBorder: (text) => foreground(colors.codeBlockBorder, text),
		quote: (text) => foreground(colors.quote, text),
		quoteBorder: (text) => foreground(colors.quoteBorder, text),
		hr: (text) => foreground(colors.hr, text),
		listBullet: (text) => foreground(colors.listBullet, text),
		bold,
		italic,
		underline,
		strikethrough,
		codeBlockIndent: "  ",
		highlightCode: (code, lang) => {
			// 先校验语言再高亮，避免 cli-highlight 输出告警；语言无效或未指定时
			// 不做自动检测（自动检测会把英文散文误判成 AppleScript 等语言），
			// 整体退化为 codeBlock 单色。
			const validLang = lang && supportsLanguage(lang) ? lang : undefined;
			if (!validLang) {
				return code
					.split("\n")
					.map((line) => foreground(colors.codeBlock, line));
			}
			try {
				return highlight(code, {
					language: validLang,
					ignoreIllegals: true,
					// 见 buildSyntaxTheme：Theme 类型不含 operator/punctuation，
					// 但渲染器动态查找，这两个键在运行时生效
					theme: buildSyntaxTheme(foreground) as HighlightTheme,
				}).split("\n");
			} catch {
				return code.split("\n");
			}
		},
	};
}

/** 默认 dark 主题（Pi dark.json 取值）。 */
export const darkMarkdownTheme: MarkdownTheme =
	createMarkdownTheme(DARK_MARKDOWN_COLORS);

/** 无色主题：所有函数为恒等函数，输出纯文本。 */
export const noColorMarkdownTheme: MarkdownTheme = {
	heading: (text) => text,
	link: (text) => text,
	linkUrl: (text) => text,
	code: (text) => text,
	codeBlock: (text) => text,
	codeBlockBorder: (text) => text,
	quote: (text) => text,
	quoteBorder: (text) => text,
	hr: (text) => text,
	listBullet: (text) => text,
	bold: (text) => text,
	italic: (text) => text,
	underline: (text) => text,
	strikethrough: (text) => text,
	codeBlockIndent: "  ",
	highlightCode: (code) => code.split("\n"),
};
