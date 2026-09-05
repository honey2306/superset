/**
 * 终端 Markdown 渲染器。
 *
 * 渲染规则移植自 Pi 的终端 UI（@earendil-works/pi-tui 的 Markdown 组件）：
 * 通过 marked.lexer 拿 token，再把每个 token 转成带 ANSI 样式的行数组。
 * 宽度计算复用 ../output 的 displayWidth（东亚宽字符按 2 列计）。
 */
import {
	Marked,
	type MarkedToken,
	type Token,
	Tokenizer,
	type Tokens,
} from "marked";
import { displayWidth } from "../output";
import {
	darkMarkdownTheme,
	type MarkdownTheme,
	noColorMarkdownTheme,
} from "./theme";

const ESC = String.fromCharCode(27);

/**
 * marked 的 Token 并集带一个 `type: string` 的 Generic（给扩展留的口子），
 * switch 无法把它从具体分支里排除。lexer 及其子 token 数组实际只产出标准
 * token，统一在读取处收窄一次，让各分支能精确到具体 token 类型。
 */
function markedTokens(tokens: Token[] | undefined): MarkedToken[] {
	return (tokens ?? []) as MarkedToken[];
}

/** 整行重置码 `\x1b[0m`（用于引用块内重放外围样式）。 */
const RESET_ALL_PATTERN = new RegExp(`${ESC}\\[0m`, "g");

/**
 * 严格删除线分词：marked 默认规则会把 `~~ x~~` 这类空格开头的序列
 * 误判成删除线，这里收紧为前后都不能紧邻空格。
 */
const STRICT_STRIKETHROUGH_REGEX =
	/^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;

class StrictStrikethroughTokenizer extends Tokenizer {
	override del(src: string): Tokens.Del | undefined {
		const match = STRICT_STRIKETHROUGH_REGEX.exec(src);
		if (!match) return undefined;
		const text = match[2] ?? "";
		return {
			type: "del",
			raw: match[0] ?? "",
			text,
			tokens: this.lexer.inlineTokens(text),
		};
	}
}

const markdownParser = new Marked();
markdownParser.setOptions({ tokenizer: new StrictStrikethroughTokenizer() });

/**
 * 流式场景下源码可能以残缺的收尾 fence（如 "``"）结束，收尾前把残缺
 * fence 从代码块文本中裁掉，避免整块 shrink/flicker。完整源码下是无操作。
 */
function trimPartialClosingFences(tokens: MarkedToken[]): void {
	const token = tokens[tokens.length - 1];
	if (token?.type === "list") {
		const lastItem = token.items[token.items.length - 1];
		if (lastItem) trimPartialClosingFences(markedTokens(lastItem.tokens));
		return;
	}
	if (token?.type === "blockquote") {
		trimPartialClosingFences(markedTokens(token.tokens));
		return;
	}
	if (token?.type !== "code") return;
	const marker = /^(`{3,}|~{3,})/.exec(token.raw)?.[1];
	const lastLine = token.raw.split("\n").pop();
	if (
		!marker ||
		!lastLine ||
		lastLine.length >= marker.length ||
		lastLine !== (marker[0] ?? "").repeat(lastLine.length)
	) {
		return;
	}
	token.text = token.text.slice(0, -lastLine.length).replace(/\n$/, "");
}

/** 行内渲染的外围样式上下文：文本如何着色、token 自身 reset 后如何恢复。 */
interface InlineStyleContext {
	applyText: (text: string) => string;
	stylePrefix: string;
}

/** 用哨兵提取样式函数的 ANSI 前缀（函数把哨兵包在什么码后面，前缀就是什么）。 */
function getStylePrefix(styleFn: (text: string) => string): string {
	const styled = styleFn("\u0000");
	const sentinelIndex = styled.indexOf("\u0000");
	return sentinelIndex >= 0 ? styled.slice(0, sentinelIndex) : "";
}

/** 顶层默认上下文：无默认文本样式，一切靠各 token 自己的样式函数。 */
const DEFAULT_INLINE_STYLE_CONTEXT: InlineStyleContext = {
	applyText: (text) => text,
	stylePrefix: "",
};

function renderInlineTokens(
	theme: MarkdownTheme,
	tokens: MarkedToken[],
	styleContext: InlineStyleContext,
): string {
	let result = "";
	const { applyText, stylePrefix } = styleContext;
	// 多行文本逐段着色，避免把 \n 包进 ANSI 码里。
	const applyTextWithNewlines = (text: string): string =>
		text
			.split("\n")
			.map((segment) => applyText(segment))
			.join("\n");
	for (const token of tokens) {
		switch (token.type) {
			case "escape":
				result += applyTextWithNewlines(token.text);
				break;
			case "text":
				// 列表项等场景的 text token 可能带嵌套行内 token
				if (token.tokens && token.tokens.length > 0) {
					result += renderInlineTokens(
						theme,
						markedTokens(token.tokens),
						styleContext,
					);
				} else {
					result += applyTextWithNewlines(token.text);
				}
				break;
			case "paragraph":
				result += renderInlineTokens(
					theme,
					markedTokens(token.tokens),
					styleContext,
				);
				break;
			case "strong":
				// 每个行内样式 token 在自身 reset 之后重新追加外围前缀，
				// 让嵌套/外围样式在其后继续生效。
				result +=
					theme.bold(
						renderInlineTokens(theme, markedTokens(token.tokens), styleContext),
					) + stylePrefix;
				break;
			case "em":
				result +=
					theme.italic(
						renderInlineTokens(theme, markedTokens(token.tokens), styleContext),
					) + stylePrefix;
				break;
			case "codespan":
				// 行内代码：只着前景色，不加反引号、不加背景
				result += theme.code(token.text) + stylePrefix;
				break;
			case "link": {
				const linkText = renderInlineTokens(
					theme,
					markedTokens(token.tokens),
					styleContext,
				);
				const styledLink = theme.link(theme.underline(linkText));
				// 文本与 href 不同时追加 " (URL)"；mailto: 链接比较时去掉前缀
				const hrefForComparison = token.href.startsWith("mailto:")
					? token.href.slice(7)
					: token.href;
				if (token.text === token.href || token.text === hrefForComparison) {
					result += styledLink + stylePrefix;
				} else {
					result +=
						styledLink + theme.linkUrl(` (${token.href})`) + stylePrefix;
				}
				break;
			}
			case "br":
				result += "\n";
				break;
			case "del":
				result +=
					theme.strikethrough(
						renderInlineTokens(theme, markedTokens(token.tokens), styleContext),
					) + stylePrefix;
				break;
			case "html":
				result += applyTextWithNewlines(token.raw);
				break;
			default:
				if ("text" in token && typeof token.text === "string") {
					result += applyTextWithNewlines(token.text);
				}
		}
	}
	// 行末多余的前缀没有可着色对象，裁掉
	while (stylePrefix !== "" && result.endsWith(stylePrefix)) {
		result = result.slice(0, -stylePrefix.length);
	}
	return result;
}

/**
 * 块级 token 转行。nextTokenType 用于块间空行：space token 自带空行，
 * 其他情况下块自身补一个，确保块间恰好一个空行。
 */
function renderToken(
	theme: MarkdownTheme,
	token: MarkedToken,
	width: number,
	nextTokenType: string | undefined,
	styleContext: InlineStyleContext,
): string[] {
	const lines: string[] = [];
	switch (token.type) {
		case "heading": {
			const headingLevel = token.depth;
			const headingPrefix = `${"#".repeat(headingLevel)} `;
			// h1：heading 色 + 粗体 + 下划线；h2 及更深：heading 色 + 粗体
			const headingStyleFn =
				headingLevel === 1
					? (text: string) => theme.heading(theme.bold(theme.underline(text)))
					: (text: string) => theme.heading(theme.bold(text));
			const headingStyleContext: InlineStyleContext = {
				applyText: headingStyleFn,
				stylePrefix: getStylePrefix(headingStyleFn),
			};
			const headingText = renderInlineTokens(
				theme,
				markedTokens(token.tokens),
				headingStyleContext,
			);
			// h1/h2 不显示井号，h3 起显示 "### " 前缀（前缀同样着色）
			const styledHeading =
				headingLevel >= 3
					? headingStyleFn(headingPrefix) + headingText
					: headingText;
			lines.push(styledHeading);
			if (nextTokenType && nextTokenType !== "space") lines.push("");
			break;
		}
		case "paragraph": {
			lines.push(
				renderInlineTokens(theme, markedTokens(token.tokens), styleContext),
			);
			// 后面紧跟列表时不加空行（列表自己有紧凑排布），space token 自己补
			if (
				nextTokenType &&
				nextTokenType !== "list" &&
				nextTokenType !== "space"
			) {
				lines.push("");
			}
			break;
		}
		case "text":
			lines.push(renderInlineTokens(theme, [token], styleContext));
			break;
		case "code": {
			const indent = theme.codeBlockIndent ?? "  ";
			lines.push(theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
			for (const highlightedLine of theme.highlightCode(
				token.text,
				token.lang,
			)) {
				lines.push(`${indent}${highlightedLine}`);
			}
			lines.push(theme.codeBlockBorder("```"));
			if (nextTokenType && nextTokenType !== "space") lines.push("");
			break;
		}
		case "list":
			lines.push(...renderList(theme, token, 0, width, styleContext));
			break;
		case "table":
			lines.push(
				...renderTable(theme, token, width, nextTokenType, styleContext),
			);
			break;
		case "blockquote": {
			const quoteStyle = (text: string) => theme.quote(theme.italic(text));
			const quoteStylePrefix = getStylePrefix(quoteStyle);
			const applyQuoteStyle = (line: string): string => {
				if (quoteStylePrefix === "") return quoteStyle(line);
				// 引用内部代码块等会整行 reset，重放前缀保证整行仍是引用样式
				const lineWithReappliedStyle = line.replace(
					RESET_ALL_PATTERN,
					`${ESC}[0m${quoteStylePrefix}`,
				);
				return quoteStyle(lineWithReappliedStyle);
			};
			// 前缀 "│ " 占 2 列，内容可用宽度减 2；引用内递归支持块级元素
			const quoteContentWidth = Math.max(1, width - 2);
			const quoteInlineStyleContext: InlineStyleContext = {
				applyText: (text) => text,
				stylePrefix: quoteStylePrefix,
			};
			const quoteTokens = markedTokens(token.tokens);
			const renderedQuoteLines: string[] = [];
			for (let i = 0; i < quoteTokens.length; i++) {
				const quoteToken = quoteTokens[i];
				if (!quoteToken) continue;
				const nextQuoteToken = quoteTokens[i + 1];
				renderedQuoteLines.push(
					...renderToken(
						theme,
						quoteToken,
						quoteContentWidth,
						nextQuoteToken?.type,
						quoteInlineStyleContext,
					),
				);
			}
			// 外层引用后已有空行，避免引用内多余空行
			while (
				renderedQuoteLines.length > 0 &&
				renderedQuoteLines[renderedQuoteLines.length - 1] === ""
			) {
				renderedQuoteLines.pop();
			}
			for (const quoteLine of renderedQuoteLines) {
				const styledLine = applyQuoteStyle(quoteLine);
				for (const wrappedLine of wrapTextWithAnsi(
					styledLine,
					quoteContentWidth,
				)) {
					lines.push(theme.quoteBorder("│ ") + wrappedLine);
				}
			}
			if (nextTokenType && nextTokenType !== "space") lines.push("");
			break;
		}
		case "hr":
			lines.push(theme.hr("─".repeat(Math.min(width, 80))));
			if (nextTokenType && nextTokenType !== "space") lines.push("");
			break;
		case "html":
			lines.push(token.raw.trim());
			break;
		case "space":
			lines.push("");
			break;
		default:
			if ("text" in token && typeof token.text === "string") {
				lines.push(token.text);
			}
	}
	return lines;
}

/** 渲染列表：每层嵌套缩进 4 空格，续行与首行文字对齐。 */
function renderList(
	theme: MarkdownTheme,
	token: Tokens.List,
	depth: number,
	width: number,
	styleContext: InlineStyleContext,
): string[] {
	const lines: string[] = [];
	const indent = "    ".repeat(depth);
	const startNumber = typeof token.start === "number" ? token.start : 1;
	for (let i = 0; i < token.items.length; i++) {
		const item = token.items[i];
		if (!item) continue;
		const isLastItem = i === token.items.length - 1;
		const bullet = token.ordered ? `${startNumber + i}. ` : "- ";
		const taskMarker = item.task ? `[${item.checked ? "x" : " "}] ` : "";
		const marker = bullet + taskMarker;
		const firstPrefix = indent + theme.listBullet(marker);
		const continuationPrefix = indent + " ".repeat(displayWidth(marker));
		const itemWidth = Math.max(1, width - displayWidth(firstPrefix));
		let renderedAnyLine = false;
		for (const itemToken of markedTokens(item.tokens)) {
			if (itemToken.type === "list") {
				lines.push(
					...renderList(theme, itemToken, depth + 1, width, styleContext),
				);
				renderedAnyLine = true;
				continue;
			}
			const itemLines = renderToken(
				theme,
				itemToken,
				itemWidth,
				undefined,
				styleContext,
			);
			for (const line of itemLines) {
				for (const wrappedLine of wrapTextWithAnsi(line, itemWidth)) {
					const linePrefix = renderedAnyLine ? continuationPrefix : firstPrefix;
					lines.push(linePrefix + wrappedLine);
					renderedAnyLine = true;
				}
			}
		}
		if (!renderedAnyLine) lines.push(firstPrefix);
		// 松弛列表项之间加空行，紧凑列表不加
		if (token.loose && !isLastItem) lines.push("");
	}
	return lines;
}

/** 单元格里最长单词的可见宽度，上限 maxUnbrokenWordWidth。 */
function getLongestWordWidth(
	text: string,
	maxUnbrokenWordWidth: number,
): number {
	const words = text.split(/\s+/).filter((word) => word.length > 0);
	let longest = 0;
	for (const word of words) {
		longest = Math.max(longest, displayWidth(word));
	}
	return Math.min(longest, maxUnbrokenWordWidth);
}

/** 单元格折行：非末行补属性重置并恢复外围样式，保证边框不被内容样式污染。 */
function wrapCellText(
	text: string,
	maxWidth: number,
	stylePrefix = "",
): string[] {
	const lines = wrapTextWithAnsi(text, Math.max(1, maxWidth));
	return lines.map((line, index) => {
		const styleReset =
			index < lines.length - 1 ? "\x1b[22;23;24;25;27;28;29;39m" : "";
		return `${line}${styleReset}${stylePrefix}`;
	});
}

/** 完整框线表格：列宽按内容收缩，行间插分隔线；过窄时回退纯文本折行。 */
function renderTable(
	theme: MarkdownTheme,
	token: Tokens.Table,
	availableWidth: number,
	nextTokenType: string | undefined,
	styleContext: InlineStyleContext,
): string[] {
	const lines: string[] = [];
	const numCols = token.header.length;
	if (numCols === 0) return lines;
	// 边框开销："│ " + (n-1) 个 " │ " + " │" = 3n + 1
	const borderOverhead = 3 * numCols + 1;
	const availableForCells = availableWidth - borderOverhead;
	if (availableForCells < numCols) {
		// 放不下稳定表格，回退为纯文本折行
		const fallbackLines = token.raw
			? wrapTextWithAnsi(token.raw, availableWidth)
			: [];
		if (nextTokenType && nextTokenType !== "space") fallbackLines.push("");
		return fallbackLines;
	}
	const maxUnbrokenWordWidth = 30;
	const naturalWidths: number[] = [];
	const minWordWidths: number[] = [];
	for (let i = 0; i < numCols; i++) {
		const headerText = renderInlineTokens(
			theme,
			markedTokens(token.header[i]?.tokens),
			styleContext,
		);
		naturalWidths[i] = displayWidth(headerText);
		minWordWidths[i] = Math.max(
			1,
			getLongestWordWidth(headerText, maxUnbrokenWordWidth),
		);
	}
	for (const row of token.rows) {
		for (let i = 0; i < row.length; i++) {
			const cellText = renderInlineTokens(
				theme,
				markedTokens(row[i]?.tokens),
				styleContext,
			);
			naturalWidths[i] = Math.max(
				naturalWidths[i] ?? 0,
				displayWidth(cellText),
			);
			minWordWidths[i] = Math.max(
				minWordWidths[i] ?? 1,
				getLongestWordWidth(cellText, maxUnbrokenWordWidth),
			);
		}
	}
	let minColumnWidths = minWordWidths;
	let minCellsWidth = minColumnWidths.reduce(
		(total, value) => total + value,
		0,
	);
	if (minCellsWidth > availableForCells) {
		// 最小单词宽度都放不下：按 1 列起步，再按权重摊剩余空间
		minColumnWidths = new Array<number>(numCols).fill(1);
		const remaining = availableForCells - numCols;
		if (remaining > 0) {
			const totalWeight = minWordWidths.reduce(
				(total, value) => total + Math.max(0, value - 1),
				0,
			);
			const growth = minWordWidths.map((value) => {
				const weight = Math.max(0, value - 1);
				return totalWeight > 0
					? Math.floor((weight / totalWeight) * remaining)
					: 0;
			});
			for (let i = 0; i < numCols; i++) {
				minColumnWidths[i] = (minColumnWidths[i] ?? 0) + (growth[i] ?? 0);
			}
			const allocated = growth.reduce((total, value) => total + value, 0);
			let leftover = remaining - allocated;
			for (let i = 0; leftover > 0 && i < numCols; i++) {
				minColumnWidths[i] = (minColumnWidths[i] ?? 0) + 1;
				leftover--;
			}
		}
		minCellsWidth = minColumnWidths.reduce((total, value) => total + value, 0);
	}
	const totalNaturalWidth =
		naturalWidths.reduce((total, value) => total + value, 0) + borderOverhead;
	let columnWidths: number[];
	if (totalNaturalWidth <= availableWidth) {
		// 全部放得下：用自然宽度（但不小于最小宽度）
		columnWidths = naturalWidths.map((width, index) =>
			Math.max(width, minColumnWidths[index] ?? 1),
		);
	} else {
		// 需要收缩：以最小宽度为底，按超出比例分配可用余量
		const totalGrowPotential = naturalWidths.reduce(
			(total, value, index) =>
				total + Math.max(0, value - (minColumnWidths[index] ?? 1)),
			0,
		);
		const extraWidth = Math.max(0, availableForCells - minCellsWidth);
		columnWidths = minColumnWidths.map((minWidth, index) => {
			const naturalWidth = naturalWidths[index] ?? minWidth;
			const minWidthDelta = Math.max(0, naturalWidth - minWidth);
			const grow =
				totalGrowPotential > 0
					? Math.floor((minWidthDelta / totalGrowPotential) * extraWidth)
					: 0;
			return minWidth + grow;
		});
		// 余数逐列补齐
		let remaining = availableForCells - columnWidths.reduce((a, b) => a + b, 0);
		while (remaining > 0) {
			let grew = false;
			for (let i = 0; i < numCols && remaining > 0; i++) {
				if ((columnWidths[i] ?? 0) < (naturalWidths[i] ?? 0)) {
					columnWidths[i] = (columnWidths[i] ?? 0) + 1;
					remaining--;
					grew = true;
				}
			}
			if (!grew) break;
		}
	}
	const topBorderCells = columnWidths.map((width) => "─".repeat(width));
	lines.push(`┌─${topBorderCells.join("─┬─")}─┐`);
	const headerCellLines = token.header.map((cell, i) =>
		wrapCellText(
			renderInlineTokens(theme, markedTokens(cell.tokens), styleContext),
			columnWidths[i] ?? 1,
			styleContext.stylePrefix,
		),
	);
	const headerLineCount = Math.max(
		...headerCellLines.map((cell) => cell.length),
	);
	for (let lineIdx = 0; lineIdx < headerLineCount; lineIdx++) {
		const rowParts = headerCellLines.map((cellLines, colIdx) => {
			const text = cellLines[lineIdx] ?? "";
			const padded =
				text +
				" ".repeat(
					Math.max(0, (columnWidths[colIdx] ?? 0) - displayWidth(text)),
				);
			return theme.bold(padded);
		});
		lines.push(`│ ${rowParts.join(" │ ")} │`);
	}
	const separatorCells = columnWidths.map((width) => "─".repeat(width));
	const separatorLine = `├─${separatorCells.join("─┼─")}─┤`;
	lines.push(separatorLine);
	for (let rowIndex = 0; rowIndex < token.rows.length; rowIndex++) {
		const row = token.rows[rowIndex] ?? [];
		const rowCellLines = row.map((cell, i) =>
			wrapCellText(
				renderInlineTokens(theme, markedTokens(cell.tokens), styleContext),
				columnWidths[i] ?? 1,
				styleContext.stylePrefix,
			),
		);
		const rowLineCount = Math.max(...rowCellLines.map((cell) => cell.length));
		for (let lineIdx = 0; lineIdx < rowLineCount; lineIdx++) {
			const rowParts = rowCellLines.map((cellLines, colIdx) => {
				const text = cellLines[lineIdx] ?? "";
				return (
					text +
					" ".repeat(
						Math.max(0, (columnWidths[colIdx] ?? 0) - displayWidth(text)),
					)
				);
			});
			lines.push(`│ ${rowParts.join(" │ ")} │`);
		}
		// 每对数据行之间都插一条分隔线
		if (rowIndex < token.rows.length - 1) lines.push(separatorLine);
	}
	const bottomBorderCells = columnWidths.map((width) => "─".repeat(width));
	lines.push(`└─${bottomBorderCells.join("─┴─")}─┘`);
	if (nextTokenType && nextTokenType !== "space") lines.push("");
	return lines;
}

/**
 * 记录跨折行需要保留的 SGR 属性。逐个属性分开存，才能在折行边界
 * 只重放仍然生效的码。
 */
class AnsiCodeTracker {
	bold = false;
	dim = false;
	italic = false;
	underline = false;
	blink = false;
	inverse = false;
	hidden = false;
	strikethrough = false;
	fgColor: string | null = null;
	bgColor: string | null = null;

	process(code: string): void {
		if (!code.endsWith("m")) return;
		const params = code.slice(2, -1);
		if (params === "" || params === "0") {
			this.reset();
			return;
		}
		const parts = params.split(";");
		let i = 0;
		while (i < parts.length) {
			const value = Number.parseInt(parts[i] ?? "", 10);
			if (Number.isNaN(value)) {
				i++;
				continue;
			}
			// 38/48 颜色码消耗多个参数
			if (value === 38 || value === 48) {
				if (parts[i + 1] === "5" && parts[i + 2] !== undefined) {
					const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]}`;
					if (value === 38) this.fgColor = colorCode;
					else this.bgColor = colorCode;
					i += 3;
					continue;
				}
				if (parts[i + 1] === "2" && parts[i + 4] !== undefined) {
					const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]};${parts[i + 3]};${parts[i + 4]}`;
					if (value === 38) this.fgColor = colorCode;
					else this.bgColor = colorCode;
					i += 5;
					continue;
				}
			}
			switch (value) {
				case 0:
					this.reset();
					break;
				case 1:
					this.bold = true;
					break;
				case 2:
					this.dim = true;
					break;
				case 3:
					this.italic = true;
					break;
				case 4:
					this.underline = true;
					break;
				case 5:
					this.blink = true;
					break;
				case 7:
					this.inverse = true;
					break;
				case 8:
					this.hidden = true;
					break;
				case 9:
					this.strikethrough = true;
					break;
				case 21:
					this.bold = false;
					break;
				case 22:
					this.bold = false;
					this.dim = false;
					break;
				case 23:
					this.italic = false;
					break;
				case 24:
					this.underline = false;
					break;
				case 25:
					this.blink = false;
					break;
				case 27:
					this.inverse = false;
					break;
				case 28:
					this.hidden = false;
					break;
				case 29:
					this.strikethrough = false;
					break;
				case 39:
					this.fgColor = null;
					break;
				case 49:
					this.bgColor = null;
					break;
				default:
					if ((value >= 30 && value <= 37) || (value >= 90 && value <= 97)) {
						this.fgColor = String(value);
					} else if (
						(value >= 40 && value <= 47) ||
						(value >= 100 && value <= 107)
					) {
						this.bgColor = String(value);
					}
					break;
			}
			i++;
		}
	}

	reset(): void {
		this.bold = false;
		this.dim = false;
		this.italic = false;
		this.underline = false;
		this.blink = false;
		this.inverse = false;
		this.hidden = false;
		this.strikethrough = false;
		this.fgColor = null;
		this.bgColor = null;
	}

	/** 当前仍生效的属性重放为一条 SGR 序列。 */
	getActiveCodes(): string {
		const codes: string[] = [];
		if (this.bold) codes.push("1");
		if (this.dim) codes.push("2");
		if (this.italic) codes.push("3");
		if (this.underline) codes.push("4");
		if (this.blink) codes.push("5");
		if (this.inverse) codes.push("7");
		if (this.hidden) codes.push("8");
		if (this.strikethrough) codes.push("9");
		if (this.fgColor !== null) codes.push(this.fgColor);
		if (this.bgColor !== null) codes.push(this.bgColor);
		return codes.length > 0 ? `\x1b[${codes.join(";")}m` : "";
	}

	/** 行尾只需关掉下划线，避免渗到行外；其余属性跨行保留。 */
	getLineEndReset(): string {
		return this.underline ? "\x1b[24m" : "";
	}
}

/** CSI 转义序列的终结字节（与 Pi 的解析器保持一致）。 */
const CSI_TERMINATOR = /[mGKHJ]/;

/** 从 position 处提取一条 CSI 转义序列，不属于则返回 null。 */
function extractAnsiCode(
	text: string,
	position: number,
): { code: string; length: number } | null {
	if (position >= text.length || text[position] !== ESC) return null;
	if (text[position + 1] !== "[") return null;
	let end = position + 2;
	while (end < text.length && !CSI_TERMINATOR.test(text[end] ?? "")) end++;
	if (end < text.length) {
		return {
			code: text.substring(position, end + 1),
			length: end + 1 - position,
		};
	}
	return null;
}

function updateTrackerFromText(text: string, tracker: AnsiCodeTracker): void {
	let position = 0;
	while (position < text.length) {
		const ansi = extractAnsiCode(text, position);
		if (ansi) {
			tracker.process(ansi.code);
			position += ansi.length;
		} else {
			position++;
		}
	}
}

/** 汉字/假名/谚文等 CJK 字符之间可以直接断行。 */
const CJK_BREAK_CHARACTER =
	/[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;

/** 按词切分，ANSI 码附着到其后第一个可见字符；CJK 字符独立成 token。 */
function splitIntoTokensWithAnsi(text: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let pendingAnsi = "";
	let currentKind: "space" | "word" | null = null;
	let position = 0;
	const flushCurrent = (): void => {
		if (current === "") return;
		tokens.push(current);
		current = "";
		currentKind = null;
	};
	while (position < text.length) {
		const ansi = extractAnsiCode(text, position);
		if (ansi) {
			pendingAnsi += ansi.code;
			position += ansi.length;
			continue;
		}
		const character = String.fromCodePoint(text.codePointAt(position) ?? 0);
		position += character.length;
		const isSpace = character === " ";
		if (!isSpace && CJK_BREAK_CHARACTER.test(character)) {
			flushCurrent();
			tokens.push(pendingAnsi + character);
			pendingAnsi = "";
			continue;
		}
		const kind = isSpace ? "space" : "word";
		if (current !== "" && currentKind !== kind) flushCurrent();
		if (pendingAnsi !== "") {
			current += pendingAnsi;
			pendingAnsi = "";
		}
		currentKind = kind;
		current += character;
	}
	if (pendingAnsi !== "") {
		if (current !== "") current += pendingAnsi;
		else if (tokens.length > 0) {
			const lastIndex = tokens.length - 1;
			tokens[lastIndex] = (tokens[lastIndex] ?? "") + pendingAnsi;
		} else {
			current = pendingAnsi;
		}
	}
	if (current !== "") tokens.push(current);
	return tokens;
}

/** 超长单词逐字符硬折（宽字符按 2 列计），折行处重放当前 ANSI 状态。 */
function breakLongWord(
	word: string,
	width: number,
	tracker: AnsiCodeTracker,
): string[] {
	const lines: string[] = [];
	let currentLine = tracker.getActiveCodes();
	let currentWidth = 0;
	let position = 0;
	while (position < word.length) {
		const ansi = extractAnsiCode(word, position);
		if (ansi) {
			currentLine += ansi.code;
			tracker.process(ansi.code);
			position += ansi.length;
			continue;
		}
		const character = String.fromCodePoint(word.codePointAt(position) ?? 0);
		position += character.length;
		const characterWidth = displayWidth(character);
		if (currentWidth + characterWidth > width) {
			const lineEndReset = tracker.getLineEndReset();
			if (lineEndReset !== "") currentLine += lineEndReset;
			lines.push(currentLine);
			currentLine = tracker.getActiveCodes();
			currentWidth = 0;
		}
		currentLine += character;
		currentWidth += characterWidth;
	}
	if (currentLine !== "") lines.push(currentLine);
	return lines.length > 0 ? lines : [""];
}

/** 单行按词折行：只折不补宽，每行可见宽度不超过 width，行尾空白裁掉。 */
function wrapSingleLine(line: string, width: number): string[] {
	if (line === "") return [""];
	if (displayWidth(line) <= width) return [line];
	const wrapped: string[] = [];
	const tracker = new AnsiCodeTracker();
	const tokens = splitIntoTokensWithAnsi(line);
	let currentLine = "";
	let currentVisibleLength = 0;
	for (const token of tokens) {
		const tokenVisibleLength = displayWidth(token);
		const isWhitespace = token.trim() === "";
		if (tokenVisibleLength > width && !isWhitespace) {
			// 词本身超行宽：先收掉当前行，再逐字符硬折
			if (currentLine !== "") {
				const lineEndReset = tracker.getLineEndReset();
				if (lineEndReset !== "") currentLine += lineEndReset;
				wrapped.push(currentLine);
				currentLine = "";
				currentVisibleLength = 0;
			}
			const broken = breakLongWord(token, width, tracker);
			for (let i = 0; i < broken.length - 1; i++) {
				wrapped.push(broken[i] ?? "");
			}
			currentLine = broken[broken.length - 1] ?? "";
			currentVisibleLength = displayWidth(currentLine);
			continue;
		}
		if (
			currentVisibleLength + tokenVisibleLength > width &&
			currentVisibleLength > 0
		) {
			const lineEndReset = tracker.getLineEndReset();
			let lineToWrap = currentLine.trimEnd();
			if (lineEndReset !== "") lineToWrap += lineEndReset;
			wrapped.push(lineToWrap);
			if (isWhitespace) {
				// 空白不作为折行后的新行开头
				currentLine = tracker.getActiveCodes();
				currentVisibleLength = 0;
			} else {
				currentLine = tracker.getActiveCodes() + token;
				currentVisibleLength = tokenVisibleLength;
			}
		} else {
			currentLine += token;
			currentVisibleLength += tokenVisibleLength;
		}
		updateTrackerFromText(token, tracker);
	}
	if (currentLine !== "") wrapped.push(currentLine);
	// 行尾空白会让可见宽度超限，裁掉
	return wrapped.length > 0 ? wrapped.map((line) => line.trimEnd()) : [""];
}

/**
 * 折一段文本（可含换行与 ANSI 码）：按词折行、超长词硬折、CJK 可断行，
 * ANSI 状态跨折行与跨源换行都保留。
 */
function wrapTextWithAnsi(text: string, width: number): string[] {
	if (text === "") return [""];
	const inputLines = text.split(/\r\n|\r|\n/);
	const result: string[] = [];
	const tracker = new AnsiCodeTracker();
	for (const inputLine of inputLines) {
		// 换行后重放此前仍生效的 ANSI 状态
		const prefix = result.length > 0 ? tracker.getActiveCodes() : "";
		result.push(...wrapSingleLine(prefix + inputLine, width));
		updateTrackerFromText(inputLine, tracker);
	}
	return result.length > 0 ? result : [""];
}

export interface RenderMarkdownOptions {
	/** 渲染主题；默认 dark 主题，可用 noColorMarkdownTheme 输出纯文本。 */
	theme?: MarkdownTheme;
	/** 左右留白列数，默认 1（右边距通过折行宽度预留，不输出尾随空格）。 */
	paddingX?: number;
	/** 传 false 时强制走 noColor 主题（--no-color / 管道输出），优先于 theme。 */
	color?: boolean;
}

/**
 * 把 Markdown 源码渲染为终端行数组（不含结尾换行）。
 *
 * @param source Markdown 源码
 * @param width 目标终端总宽度（含左右留白）
 * @param options 主题、留白与无色开关
 */
export function renderMarkdown(
	source: string,
	width: number,
	options?: RenderMarkdownOptions,
): string[] {
	const theme =
		options?.color === false
			? noColorMarkdownTheme
			: (options?.theme ?? darkMarkdownTheme);
	const paddingX = options?.paddingX ?? 1;
	const contentWidth = Math.max(1, width - paddingX * 2);
	if (!source || source.trim() === "") return [];
	// Tab 统一替换为 3 空格
	const normalizedText = source.replaceAll("\t", "   ");
	const tokens = markedTokens(markdownParser.lexer(normalizedText));
	trimPartialClosingFences(tokens);
	const renderedLines: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;
		const nextToken = tokens[i + 1];
		renderedLines.push(
			...renderToken(
				theme,
				token,
				contentWidth,
				nextToken?.type,
				DEFAULT_INLINE_STYLE_CONTEXT,
			),
		);
	}
	const wrappedLines: string[] = [];
	for (const line of renderedLines) {
		wrappedLines.push(...wrapTextWithAnsi(line, contentWidth));
	}
	const leftMargin = " ".repeat(paddingX);
	const lines = wrappedLines.map((line) => (leftMargin + line).trimEnd());
	return lines.length > 0 ? lines : [""];
}
