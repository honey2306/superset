#!/usr/bin/env bun
/**
 * PROTOTYPE — 可删除的 Superset 本地交互式 CLI。
 *
 * 目的：以 Claude Code 的对话、输入框、命令菜单和权限交互为基线，
 * 只验证 Superset 特有的多会话切换与后台通知。
 *
 * Markdown 直接复用 Pi 自己的渲染组件（@earendil-works/pi-tui 的 Markdown），
 * 主题按 Pi 的 dark.json 取值，因此输出与 Pi 完全一致（含语法高亮与表格）。
 *
 * 限制：全部数据均在内存中，不连接真实 host-service。
 * 运行：bun scripts/prototypes/superset-cli-prototype.ts
 */

import { emitKeypressEvents } from "node:readline";
import { Markdown } from "@earendil-works/pi-tui";
import { highlight, supportsLanguage } from "cli-highlight";

const ansi = {
	clear: "\x1b[2J\x1b[H",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	italic: "\x1b[3m",
	underline: "\x1b[4m",
	strike: "\x1b[9m",
	reset: "\x1b[0m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	magenta: "\x1b[35m",
	gray: "\x1b[90m",
};

/**
 * Pi 的 dark 主题取值（theme/dark.json 的 vars + colors）。
 * fg() 与 Pi 的 theme.fg() 一致：truecolor 前景色 + \x1b[39m 复位。
 */
const piColors = {
	mdHeading: "#f0c674",
	mdLink: "#81a2be",
	mdLinkUrl: "#666666", // dimGray
	mdCode: "#8abeb7", // accent
	mdCodeBlock: "#b5bd68", // green
	mdCodeBlockBorder: "#808080", // gray
	mdQuote: "#808080",
	mdQuoteBorder: "#808080",
	mdHr: "#808080",
	mdListBullet: "#8abeb7", // accent
	syntaxKeyword: "#569CD6",
	syntaxComment: "#6A9955",
	syntaxString: "#CE9178",
	syntaxNumber: "#B5CEA8",
	syntaxFunction: "#DCDCAA",
	syntaxType: "#4EC9B0",
	syntaxVariable: "#9CDCFE",
	syntaxOperator: "#D4D4D4",
	syntaxPunctuation: "#D4D4D4",
	muted: "#808080",
	diffAdded: "#b5bd68",
	diffRemoved: "#cc6666",
} as const;

function fg(hex: string, text: string) {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** 与 Pi 的 buildCliHighlightTheme 逐项对应。 */
const cliHighlightTheme = {
	keyword: (s: string) => fg(piColors.syntaxKeyword, s),
	built_in: (s: string) => fg(piColors.syntaxType, s),
	literal: (s: string) => fg(piColors.syntaxNumber, s),
	number: (s: string) => fg(piColors.syntaxNumber, s),
	regexp: (s: string) => fg(piColors.syntaxString, s),
	string: (s: string) => fg(piColors.syntaxString, s),
	comment: (s: string) => fg(piColors.syntaxComment, s),
	doctag: (s: string) => fg(piColors.syntaxComment, s),
	meta: (s: string) => fg(piColors.muted, s),
	function: (s: string) => fg(piColors.syntaxFunction, s),
	title: (s: string) => fg(piColors.syntaxFunction, s),
	class: (s: string) => fg(piColors.syntaxType, s),
	type: (s: string) => fg(piColors.syntaxType, s),
	tag: (s: string) => fg(piColors.syntaxPunctuation, s),
	name: (s: string) => fg(piColors.syntaxKeyword, s),
	attr: (s: string) => fg(piColors.syntaxVariable, s),
	variable: (s: string) => fg(piColors.syntaxVariable, s),
	params: (s: string) => fg(piColors.syntaxVariable, s),
	operator: (s: string) => fg(piColors.syntaxOperator, s),
	punctuation: (s: string) => fg(piColors.syntaxPunctuation, s),
	emphasis: (s: string) => `\x1b[3m${s}\x1b[23m`,
	strong: (s: string) => `\x1b[1m${s}\x1b[22m`,
	link: (s: string) => `\x1b[4m${s}\x1b[24m`,
	addition: (s: string) => fg(piColors.diffAdded, s),
	deletion: (s: string) => fg(piColors.diffRemoved, s),
};

/** 与 Pi 的 getMarkdownTheme() 逐项对应。 */
const markdownTheme = {
	heading: (text: string) => fg(piColors.mdHeading, text),
	link: (text: string) => fg(piColors.mdLink, text),
	linkUrl: (text: string) => fg(piColors.mdLinkUrl, text),
	code: (text: string) => fg(piColors.mdCode, text),
	codeBlock: (text: string) => fg(piColors.mdCodeBlock, text),
	codeBlockBorder: (text: string) => fg(piColors.mdCodeBlockBorder, text),
	quote: (text: string) => fg(piColors.mdQuote, text),
	quoteBorder: (text: string) => fg(piColors.mdQuoteBorder, text),
	hr: (text: string) => fg(piColors.mdHr, text),
	listBullet: (text: string) => fg(piColors.mdListBullet, text),
	bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
	italic: (text: string) => `\x1b[3m${text}\x1b[23m`,
	underline: (text: string) => `\x1b[4m${text}\x1b[24m`,
	strikethrough: (text: string) => `\x1b[9m${text}\x1b[29m`,
	highlightCode: (code: string, lang?: string) => {
		// 与 Pi 一致：语言无效时不做自动检测，整体用 mdCodeBlock 单色。
		const validLang = lang && supportsLanguage(lang) ? lang : undefined;
		if (!validLang) {
			return code.split("\n").map((l) => fg(piColors.mdCodeBlock, l));
		}
		try {
			return highlight(code, {
				language: validLang,
				ignoreIllegals: true,
				theme: cliHighlightTheme,
			}).split("\n");
		} catch {
			return code.split("\n").map((l) => fg(piColors.mdCodeBlock, l));
		}
	},
};

/** 复用 Pi 的组件渲染 Markdown，paddingX=1 与 Pi 的 assistant 消息一致。 */
function renderMarkdown(source: string, width = terminalWidth() - 1): string[] {
	return new Markdown(source, 1, 0, markdownTheme).render(width);
}

type SessionStatus = "idle" | "running" | "offline" | "awaiting_permission";
type View = "conversation" | "sessions" | "permission";

type Message = {
	role: "user" | "agent";
	text: string;
};

type Session = {
	id: string;
	title: string;
	workspace: string;
	agent: string;
	model: string;
	status: SessionStatus;
	messages: Message[];
	queued: string[];
	permission?: string;
};

type Notice = {
	text: string;
	tone: "info" | "success" | "warning";
};

const sessions: Session[] = [
	{
		id: "36363b3f",
		title: "Superset CLI 原型设计",
		workspace: "superset",
		agent: "Claude",
		model: "Opus",
		status: "idle",
		messages: [
			{ role: "user", text: "设计一个可以恢复对话的本地 CLI。" },
			{
				role: "agent",
				text: `我会沿用 **Pi / Claude Code** 的对话体验，只增加 Superset 特有的多会话能力。

## 核心设计

CLI 直接连接本机 host-service，*不引入任何云端依赖*：

- 读取 \`~/.superset/host/<scope>/manifest.json\`
- 通过本地 tRPC 调用 \`acpSessions.*\`
- 用 WebSocket 订阅回合状态

### 恢复已有对话

\`\`\`bash
superset sessions list --json
superset sessions send 36363b3f "继续" --follow
\`\`\`

其中 \`--follow\` 会订阅流式输出，直到回合结束。

> offline 的会话会先经 session/load 复活，再继续原上下文。

---

下一步我会验证 **终端读写** 与 workspace 创建两条链路。`,
			},
		],
		queued: [],
	},
	{
		id: "f216e415",
		title: "修复内置浏览器",
		workspace: "superset",
		agent: "Pi",
		model: "pi-acp",
		status: "running",
		messages: [
			{ role: "user", text: "继续验证内置浏览器。" },
			{ role: "agent", text: "正在运行桌面端验证……" },
		],
		queued: [],
	},
	{
		id: "df6433e8",
		title: "添加全局记忆功能",
		workspace: "superset",
		agent: "Claude",
		model: "Sonnet",
		status: "awaiting_permission",
		messages: [
			{ role: "user", text: "实现全局记忆功能。" },
			{ role: "agent", text: "需要运行数据库生成命令以继续。" },
		],
		queued: [],
		permission: "bun run db:generate:desktop",
	},
	{
		id: "0278a2fd",
		title: "自定义占位问题",
		workspace: "superset",
		agent: "Pi",
		model: "pi-acp",
		status: "offline",
		messages: [
			{ role: "user", text: "检查自定义占位符没有渲染的问题。" },
			{
				role: "agent",
				text: "定位到了 PlaceholderInput，下一步需要核对状态恢复。",
			},
		],
		queued: [],
	},
];

const slashCommands = [
	["/sessions", "切换对话"],
	["/switch", "按序号、ID 或标题切换"],
	["/new", "创建新对话"],
	["/history", "显示更多历史"],
	["/status", "查看所有对话状态"],
	["/queue", "查看排队消息"],
	["/permissions", "处理权限请求"],
	["/cancel", "中止当前回合"],
	["/clear", "清理对话显示"],
	["/help", "查看命令"],
	["/exit", "退出原型"],
] as const;

let currentIndex = 0;
let previousIndex: number | undefined;
let view: View = "conversation";
let buffer = "";
let selectedIndex = 0;
let permissionIndex = 0;
let visibleMessageCount = 8;
let active = true;
let firstCtrlCAt = 0;
let notice: Notice | undefined;
let streamingText = "";
let streamingSessionId: string | undefined;
const inputHistory: string[] = [];
let historyIndex = 0;

const current = () => sessions[currentIndex];
const terminalWidth = () =>
	Math.max(64, Math.min(process.stdout.columns ?? 84, 100));
const contentWidth = () => terminalWidth() - 6;

let renderedRows = 0;
let cursorTarget: { row: number; column: number } | undefined;

function setCursorTarget(row: number, column: number) {
	cursorTarget = { row, column };
}

function takeCursorTarget() {
	const target = cursorTarget;
	cursorTarget = undefined;
	return target;
}

function print(text = "") {
	renderedRows += 1;
	process.stdout.write(`${text}\n`);
}

function stripAnsi(text: string) {
	let result = "";
	let insideEscape = false;
	for (const character of text) {
		if (character === "") {
			insideEscape = true;
			continue;
		}
		if (insideEscape) {
			if (character === "m") insideEscape = false;
			continue;
		}
		result += character;
	}
	return result;
}

function displayWidth(text: string) {
	let width = 0;
	for (const character of stripAnsi(text)) {
		const code = character.codePointAt(0) ?? 0;
		const wide =
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6);
		width += wide ? 2 : 1;
	}
	return width;
}

function pad(text: string, target: number) {
	return `${text}${" ".repeat(Math.max(0, target - displayWidth(text)))}`;
}

function truncate(text: string, target: number) {
	let result = "";
	let width = 0;
	for (const character of text) {
		const next = displayWidth(character);
		if (width + next > target - 1) return `${result}…`;
		result += character;
		width += next;
	}
	return result;
}

function wrap(text: string, target = contentWidth()) {
	const result: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (!paragraph) {
			result.push("");
			continue;
		}
		let currentLine = "";
		let width = 0;
		for (const character of paragraph) {
			const next = displayWidth(character);
			if (width + next > target) {
				result.push(currentLine);
				currentLine = character;
				width = next;
				continue;
			}
			currentLine += character;
			width += next;
		}
		result.push(currentLine);
	}
	return result.length > 0 ? result : [""];
}

function statusText(session: Session) {
	switch (session.status) {
		case "idle":
			return `${ansi.green}idle${ansi.reset}`;
		case "running":
			return `${ansi.cyan}working${ansi.reset}`;
		case "offline":
			return `${ansi.gray}offline${ansi.reset}`;
		case "awaiting_permission":
			return `${ansi.yellow}permission${ansi.reset}`;
	}
}

function renderBrand() {
	print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	print(
		`${ansi.dim}${current().workspace}  ·  ${current().title}  ·  ${current().agent} ${current().model}${ansi.reset}`,
	);
	print();
}

function renderMessage(message: Message) {
	if (message.role === "user") {
		const lines = wrap(message.text, contentWidth() - 2);
		print(`${ansi.bold}${ansi.cyan}❯${ansi.reset} ${lines[0]}`);
		for (const continuation of lines.slice(1)) print(`  ${continuation}`);
		print();
		return;
	}

	print(`${ansi.bold}${ansi.magenta}●${ansi.reset}`);
	for (const textLine of renderMarkdown(message.text)) print(` ${textLine}`);
	print();
}

function renderConversation() {
	renderBrand();
	const messages = current().messages.slice(-visibleMessageCount);
	for (const message of messages) renderMessage(message);

	if (streamingSessionId === current().id) {
		print(`${ansi.bold}${ansi.magenta}●${ansi.reset}`);
		if (streamingText) {
			for (const textLine of renderMarkdown(streamingText))
				print(` ${textLine}`);
		} else {
			print(` ${ansi.dim}正在思考… ✻${ansi.reset}`);
		}
		print();
	}

	if (current().status === "offline") {
		print(
			`${ansi.dim}  此对话已离线。发送消息时会恢复原 Agent 会话。${ansi.reset}`,
		);
		print();
	}

	if (notice) {
		const color =
			notice.tone === "warning"
				? ansi.yellow
				: notice.tone === "success"
					? ansi.green
					: ansi.cyan;
		print(`${color}●${ansi.reset} ${notice.text}`);
		print();
	}

	if (buffer.startsWith("/")) renderCommandMenu();
	renderComposer();
}

function renderCommandMenu() {
	const query = buffer.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? "";
	const matches = slashCommands.filter(([command]) =>
		command.slice(1).startsWith(query),
	);
	if (matches.length === 0) return;

	print(
		`${ansi.gray}╭─ commands ${"─".repeat(Math.max(1, terminalWidth() - 13))}╮${ansi.reset}`,
	);
	for (const [command, description] of matches.slice(0, 6)) {
		const label = `  ${ansi.bold}${pad(command, 16)}${ansi.reset}${ansi.dim}${description}${ansi.reset}`;
		print(
			`${ansi.gray}│${ansi.reset}${pad(label, terminalWidth() - 2)}${ansi.gray}│${ansi.reset}`,
		);
	}
	print(`${ansi.gray}╰${"─".repeat(terminalWidth() - 2)}╯${ansi.reset}`);
}

function renderComposer() {
	const innerWidth = terminalWidth() - 4;
	const inputLines = wrap(buffer, innerWidth - 2);
	const visibleLines = inputLines.slice(-4);
	print(`${ansi.gray}╭${"─".repeat(terminalWidth() - 2)}╮${ansi.reset}`);

	const rendered = visibleLines.length > 0 ? visibleLines : [""];
	for (const [index, inputLine] of rendered.entries()) {
		const prefix = index === 0 ? `${ansi.bold}❯${ansi.reset} ` : "  ";
		const value = `${prefix}${inputLine}`;
		if (index === rendered.length - 1) {
			// 输入行结构：框线 │ + 一个空格 + 提示符 + 已输入文本，光标停在文本末尾。
			const borderOffset = displayWidth("│ ");
			setCursorTarget(
				renderedRows,
				borderOffset +
					displayWidth(stripAnsi(prefix)) +
					displayWidth(inputLine),
			);
		}
		print(
			`${ansi.gray}│${ansi.reset} ${pad(value, innerWidth)} ${ansi.gray}│${ansi.reset}`,
		);
	}
	print(`${ansi.gray}╰${"─".repeat(terminalWidth() - 2)}╯${ansi.reset}`);

	const session = current();
	const left = `${session.model} · ${statusText(session)}`;
	const right =
		session.status === "running"
			? "Enter 排队 · Esc 中止"
			: "/ 命令 · Alt+↑↓ 切换对话";
	const spacing = Math.max(
		2,
		terminalWidth() - displayWidth(left) - displayWidth(right) - 2,
	);
	print(` ${left}${" ".repeat(spacing)}${ansi.dim}${right}${ansi.reset}`);
}

function renderSessions() {
	print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	print();
	print(`${ansi.bold}选择对话${ansi.reset}`);
	print(`${ansi.dim}输入可搜索 · ↑↓ 选择 · Enter 切换 · Esc 返回${ansi.reset}`);
	print();

	const filter = buffer.toLowerCase();
	const filtered = sessions
		.map((session, index) => ({ session, index }))
		.filter(({ session }) =>
			`${session.title} ${session.id} ${session.agent}`
				.toLowerCase()
				.includes(filter),
		);
	if (selectedIndex >= filtered.length)
		selectedIndex = Math.max(0, filtered.length - 1);

	print(`${ansi.gray}╭${"─".repeat(terminalWidth() - 2)}╮${ansi.reset}`);
	if (filtered.length === 0) {
		print(
			`${ansi.gray}│${ansi.reset}  ${pad(`${ansi.dim}没有匹配的对话${ansi.reset}`, terminalWidth() - 4)}${ansi.gray}│${ansi.reset}`,
		);
	}
	for (const [row, item] of filtered.entries()) {
		const selected = row === selectedIndex;
		const cursor = selected ? `${ansi.cyan}❯${ansi.reset}` : " ";
		const activeMark =
			item.index === currentIndex ? `${ansi.green}●${ansi.reset}` : " ";
		const titleWidth = terminalWidth() - 30;
		const title = truncate(item.session.title, titleWidth);
		const metadata = truncate(
			`${item.session.agent} · ${item.session.model}`,
			18,
		);
		const titleCell = pad(
			`${selected ? ansi.bold : ""}${title}${ansi.reset}`,
			titleWidth,
		);
		print(
			`${ansi.gray}│${ansi.reset} ${cursor} ${activeMark} ${titleCell} ${pad(`${ansi.dim}${metadata}${ansi.reset}`, 18)} ${ansi.gray}│${ansi.reset}`,
		);
		print(
			`${ansi.gray}│${ansi.reset}       ${pad(`${ansi.dim}${item.session.id}${ansi.reset}`, titleWidth - 2)} ${pad(statusText(item.session), 18)} ${ansi.gray}│${ansi.reset}`,
		);
	}
	print(`${ansi.gray}╰${"─".repeat(terminalWidth() - 2)}╯${ansi.reset}`);
	print();
	const searchLabel = `搜索：${buffer || "输入标题、Agent 或 ID"}`;
	setCursorTarget(
		renderedRows,
		buffer ? displayWidth(`搜索：${buffer}`) : displayWidth("搜索："),
	);
	print(`${ansi.dim}${searchLabel}${ansi.reset}`);
}

function renderPermission() {
	renderBrand();
	print(`${ansi.yellow}${ansi.bold}Claude 请求执行命令${ansi.reset}`);
	print();
	print(`${ansi.gray}╭${"─".repeat(terminalWidth() - 2)}╮${ansi.reset}`);
	print(
		`${ansi.gray}│${ansi.reset}${pad("", terminalWidth() - 2)}${ansi.gray}│${ansi.reset}`,
	);
	print(
		`${ansi.gray}│${ansi.reset}  ${pad(current().permission ?? "未知命令", terminalWidth() - 5)} ${ansi.gray}│${ansi.reset}`,
	);
	print(
		`${ansi.gray}│${ansi.reset}${pad("", terminalWidth() - 2)}${ansi.gray}│${ansi.reset}`,
	);
	print(`${ansi.gray}╰${"─".repeat(terminalWidth() - 2)}╯${ansi.reset}`);
	print();
	print("是否允许执行？");
	print();
	const options = ["允许一次", "允许，并且本会话不再询问此命令", "拒绝"];
	for (const [index, option] of options.entries()) {
		const cursor =
			index === permissionIndex ? `${ansi.cyan}❯${ansi.reset}` : " ";
		print(` ${cursor} ${index + 1}. ${option}`);
	}
	print();
	print(`${ansi.dim}Enter 确认 · Esc 拒绝并返回${ansi.reset}`);
}

function render() {
	if (!active) return;
	renderedRows = 0;
	takeCursorTarget();
	// 绘制期间隐藏光标，避免整屏重绘时光标闪烁。
	process.stdout.write(`\x1b[?25l${ansi.clear}`);
	if (view === "conversation") renderConversation();
	else if (view === "sessions") renderSessions();
	else renderPermission();

	const target = takeCursorTarget();
	if (target) {
		process.stdout.write(
			`\x1b[${target.row + 1};${target.column + 1}H\x1b[?25h`,
		);
		return;
	}
	process.stdout.write("\x1b[?25l");
}

function filteredSessions() {
	const filter = buffer.toLowerCase();
	return sessions
		.map((session, index) => ({ session, index }))
		.filter(({ session }) =>
			`${session.title} ${session.id} ${session.agent}`
				.toLowerCase()
				.includes(filter),
		);
}

function switchTo(index: number) {
	if (index !== currentIndex) {
		previousIndex = currentIndex;
		currentIndex = index;
	}
	visibleMessageCount = 8;
	buffer = "";
	view = "conversation";
	notice = {
		text: `已切换到“${current().title}”`,
		tone: "success",
	};
	render();
}

function findSession(target: string) {
	if (target === "previous" && previousIndex !== undefined)
		return previousIndex;
	const numeric = Number(target);
	if (Number.isInteger(numeric) && numeric >= 1 && numeric <= sessions.length)
		return numeric - 1;
	const byId = sessions.findIndex((session) => session.id.startsWith(target));
	if (byId >= 0) return byId;
	const matches = sessions
		.map((session, index) => ({ index, title: session.title.toLowerCase() }))
		.filter(({ title }) => title.includes(target.toLowerCase()));
	return matches.length === 1 ? matches[0]?.index : undefined;
}

const delay = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

async function simulateAgentReply(session: Session, prompt: string) {
	const wasOffline = session.status === "offline";
	session.status = "running";
	streamingSessionId = session.id;
	streamingText = wasOffline ? "正在恢复原会话…" : "";
	render();
	await delay(500);

	const chunks = [
		wasOffline
			? "我已恢复这段对话，上下文仍然保留。"
			: "好的，我先确认当前状态。",
		`\n\n## 处理计划\n\n针对“${prompt.length > 24 ? `${prompt.slice(0, 24)}…` : prompt}”：\n`,
		"\n- 核对 workspace 与分支状态\n- 运行相关测试\n- 汇总失败用例",
		"\n\n随后执行：\n\n```bash\nbun run test\n```\n",
		"\n完成后我会把 **失败用例** 和建议一起汇报。",
	];
	let reply = "";
	for (const chunk of chunks) {
		reply += chunk;
		streamingText = reply;
		render();
		await delay(650);
	}

	session.messages.push({ role: "agent", text: reply });
	session.status = "idle";
	streamingSessionId = undefined;
	streamingText = "";
	notice =
		current().id === session.id
			? undefined
			: { text: `后台对话“${session.title}”已完成`, tone: "success" };
	render();

	const queued = session.queued.shift();
	if (queued) {
		session.messages.push({ role: "user", text: queued });
		void simulateAgentReply(session, queued);
	}
}

function sendMessage(text: string) {
	const session = current();
	if (session.status === "awaiting_permission") {
		view = "permission";
		permissionIndex = 0;
		render();
		return;
	}
	if (session.status === "running") {
		session.queued.push(text);
		notice = { text: "消息已排队，将在当前回合完成后发送", tone: "info" };
		render();
		return;
	}
	session.messages.push({ role: "user", text });
	notice = undefined;
	void simulateAgentReply(session, text);
}

function showHelp() {
	current().messages.push({
		role: "agent",
		text: `## 可用命令\n\n${slashCommands
			.map(([command, description]) => `- \`${command}\` — ${description}`)
			.join("\n")}\n\n快捷键：\`Alt+↑/↓\` 切换对话，\`Esc\` 中止回合。`,
	});
	visibleMessageCount = 12;
}

function handleCommand(input: string) {
	const [name, ...parts] = input.slice(1).trim().split(/\s+/);
	const argument = parts.join(" ");
	switch (name) {
		case "sessions":
			view = "sessions";
			selectedIndex = currentIndex;
			buffer = "";
			break;
		case "switch": {
			const index = findSession(argument);
			if (index === undefined) {
				notice = { text: `未找到唯一匹配的对话：${argument}`, tone: "warning" };
			} else switchTo(index);
			break;
		}
		case "new": {
			const session: Session = {
				id: crypto.randomUUID().slice(0, 8),
				title: argument || "新对话",
				workspace: current().workspace,
				agent: "Claude",
				model: "Opus",
				status: "idle",
				messages: [],
				queued: [],
			};
			sessions.unshift(session);
			currentIndex = 0;
			notice = { text: "新对话已创建", tone: "success" };
			break;
		}
		case "history":
			visibleMessageCount = Math.min(50, Number(argument) || 20);
			break;
		case "status":
			view = "sessions";
			selectedIndex = currentIndex;
			buffer = "";
			break;
		case "queue":
			current().messages.push({
				role: "agent",
				text:
					current().queued.length > 0
						? current()
								.queued.map((item, index) => `${index + 1}. ${item}`)
								.join("\n")
						: "当前没有排队消息。",
			});
			break;
		case "permissions":
			if (current().permission) {
				view = "permission";
				permissionIndex = 0;
			} else notice = { text: "当前没有权限请求", tone: "info" };
			break;
		case "cancel":
			if (current().status === "running") {
				current().status = "idle";
				streamingSessionId = undefined;
				streamingText = "";
				notice = { text: "已请求中止当前回合", tone: "warning" };
			}
			break;
		case "clear":
			visibleMessageCount = 0;
			break;
		case "help":
		case "?":
			showHelp();
			break;
		case "exit":
			shutdown();
			break;
		default:
			notice = { text: `未知命令：/${name}`, tone: "warning" };
	}
}

function submit() {
	const input = buffer.trim();
	buffer = "";
	if (!input) return render();
	inputHistory.push(input);
	historyIndex = inputHistory.length;
	if (input.startsWith("/")) handleCommand(input);
	else sendMessage(input);
	render();
}

function resolvePermission(approved: boolean) {
	const session = current();
	view = "conversation";
	if (!approved) {
		session.permission = undefined;
		session.status = "idle";
		notice = { text: "已拒绝权限请求", tone: "warning" };
		render();
		return;
	}
	session.permission = undefined;
	session.status = "running";
	notice = { text: "已允许一次，Agent 继续执行", tone: "success" };
	render();
	setTimeout(() => {
		session.status = "idle";
		notice = { text: `“${session.title}”权限步骤已完成`, tone: "success" };
		render();
	}, 1600);
}

function cycleSession(direction: 1 | -1) {
	const next = (currentIndex + direction + sessions.length) % sessions.length;
	switchTo(next);
}

function shutdown() {
	active = false;
	if (process.stdin.isTTY) process.stdin.setRawMode(false);
	process.stdin.pause();
	// 退出前恢复光标可见性，避免污染用户后续的终端会话。
	process.stdout.write(`${ansi.clear}\x1b[?25h`);
	print(`${ansi.dim}已退出原型；后台对话在真实产品中会继续运行。${ansi.reset}`);
}

function onKeypress(
	character: string | undefined,
	key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean },
) {
	if (!active) return;

	if (view === "sessions") {
		const matches = filteredSessions();
		if (key.name === "up") selectedIndex = Math.max(0, selectedIndex - 1);
		else if (key.name === "down")
			selectedIndex = Math.min(
				Math.max(0, matches.length - 1),
				selectedIndex + 1,
			);
		else if (key.name === "return" && matches[selectedIndex])
			return switchTo(matches[selectedIndex].index);
		else if (key.name === "escape") {
			view = "conversation";
			buffer = "";
		} else if (key.name === "backspace") {
			buffer = buffer.slice(0, -1);
			selectedIndex = 0;
		} else if (character && !key.ctrl && !key.meta && character >= " ") {
			buffer += character;
			selectedIndex = 0;
		}
		render();
		return;
	}

	if (view === "permission") {
		if (key.name === "up") permissionIndex = Math.max(0, permissionIndex - 1);
		else if (key.name === "down")
			permissionIndex = Math.min(2, permissionIndex + 1);
		else if (key.name === "return")
			return resolvePermission(permissionIndex < 2);
		else if (key.name === "escape") return resolvePermission(false);
		else if (character === "1" || character === "2")
			return resolvePermission(true);
		else if (character === "3") return resolvePermission(false);
		render();
		return;
	}

	if (key.meta && key.name === "up") return cycleSession(-1);
	if (key.meta && key.name === "down") return cycleSession(1);
	if (key.name === "escape" && current().status === "running") {
		current().status = "idle";
		streamingSessionId = undefined;
		streamingText = "";
		notice = { text: "已请求中止当前回合", tone: "warning" };
		render();
		return;
	}
	if (key.ctrl && key.name === "c") {
		if (buffer) {
			buffer = "";
			render();
			return;
		}
		const now = Date.now();
		if (now - firstCtrlCAt < 1200) shutdown();
		else {
			firstCtrlCAt = now;
			notice = { text: "再按一次 Ctrl+C 退出", tone: "info" };
			render();
		}
		return;
	}
	if (key.name === "return" && key.shift) {
		buffer += "\n";
		render();
		return;
	}
	if (key.ctrl && key.name === "j") {
		buffer += "\n";
		render();
		return;
	}
	if (key.name === "return") return submit();
	if (key.name === "backspace") buffer = buffer.slice(0, -1);
	else if (key.name === "up" && inputHistory.length > 0) {
		historyIndex = Math.max(0, historyIndex - 1);
		buffer = inputHistory[historyIndex] ?? "";
	} else if (key.name === "down" && inputHistory.length > 0) {
		historyIndex = Math.min(inputHistory.length, historyIndex + 1);
		buffer = inputHistory[historyIndex] ?? "";
	} else if (character && !key.ctrl && !key.meta && character >= " ") {
		buffer += character;
	}
	render();
}

if (process.argv.includes("--demo")) {
	process.stdout.write(ansi.clear);
	renderConversation();
	process.exit(0);
}

if (!process.stdin.isTTY) {
	print("此原型需要交互式终端。静态预览请添加 --demo。");
	process.exit(1);
}

render();
emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("keypress", onKeypress);
process.stdout.on("resize", render);
process.on("exit", () => process.stdout.write("\x1b[?25h"));

setTimeout(() => {
	const session = sessions.find((item) => item.id === "f216e415");
	if (!session || session.status !== "running") return;
	session.status = "idle";
	session.messages.push({
		role: "agent",
		text: "桌面端验证完成，内置浏览器可以正常加载。",
	});
	notice = { text: `后台对话“${session.title}”已完成`, tone: "success" };
	render();
}, 7500);
