/**
 * `superset` (bare, on a TTY) — the interactive full-screen chat UI.
 *
 * Mirrors the validated prototype's interaction model: three views
 * (conversation / sessions / permission) rendered as whole-screen frames with
 * a bordered composer, a slash-command menu, and Alt+↑/↓ session switching.
 * Unlike the prototype, every piece of state comes from the real
 * host-service: sessions, transcripts, streaming turns, queues, and
 * permission requests.
 */

import { emitKeypressEvents as nodeEmitKeypressEvents } from "node:readline";
import type {
	ContentBlock,
	PendingPermission,
} from "@superset/session-protocol";
import { makeSelectedOutcome } from "@superset/session-protocol";
import { contentBlockToText } from "../lib/content";
import type { CommandContext } from "../lib/context";
import { CliError } from "../lib/exit-codes";
import type { HostConnection } from "../lib/host-connection";
import { renderMarkdown } from "../lib/markdown";
import { stripAnsi, truncateVisible } from "../lib/output";
import {
	loadCatalog,
	resolveWorkspace,
	type WorkspaceRef,
} from "../lib/resolve";
import { STOP_STREAM, subscribeToSession } from "../lib/stream";
import { ansi, Frame } from "../lib/tui";
import { markdownThemeFor, renderWidth } from "./sessions/shared";

type View = "conversation" | "sessions" | "permission";

interface ChatMessage {
	role: "user" | "agent";
	text: string;
}

interface ChatSession {
	sessionId: string;
	title: string;
	agent: string;
	status: string;
	messages: ChatMessage[];
	pendingPermissions: PendingPermission[];
	lastSeq: number;
	epoch?: string;
}

type Notice = { text: string; tone: "info" | "success" | "warning" };

const HARNESS_ALIASES: Record<string, string> = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
	deepseek: "deepseek-acp",
};

const slashCommands = [
	["/sessions", "切换对话"],
	["/new", "创建新对话"],
	["/history", "显示更多历史"],
	["/permissions", "处理权限请求"],
	["/cancel", "中止当前回合"],
	["/clear", "清理对话显示"],
	["/help", "查看命令"],
	["/exit", "退出"],
] as const;

interface TuiState {
	connection: HostConnection;
	workspace: WorkspaceRef;
	sessions: ChatSession[];
	currentIndex: number;
	view: View;
	buffer: string;
	selectedIndex: number;
	permissionIndex: number;
	visibleMessageCount: number;
	notice: Notice | undefined;
	streamingSessionId: string | undefined;
	streamingText: string;
	inputHistory: string[];
	historyIndex: number;
	/** Selected row in the slash-command menu, when it is visible. */
	menuIndex: number;
	active: boolean;
	lastCtrlCAt: number;
}

export async function chatCommand(ctx: CommandContext): Promise<number> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);
	const workspace = resolveWorkspace(
		catalog.workspaces,
		ctx.args.options.get("workspace")?.[0],
		process.cwd(),
	);

	const state: TuiState = {
		connection,
		workspace,
		sessions: [],
		currentIndex: 0,
		view: "conversation",
		buffer: "",
		selectedIndex: 0,
		permissionIndex: 0,
		visibleMessageCount: 8,
		notice: undefined,
		streamingSessionId: undefined,
		streamingText: "",
		inputHistory: [],
		historyIndex: 0,
		menuIndex: 0,
		active: true,
		lastCtrlCAt: 0,
	};

	await refreshSessions(state);
	// A fresh conversation on entry: the list stays one Alt+↑/↓ or /sessions
	// away, but the default landing is a clean composer.
	await createSession(state, "");
	state.currentIndex = 0;
	state.notice = undefined;

	if (process.stdin.isTTY !== true) {
		process.stdout.write("交互模式需要终端。非交互使用请运行子命令。\n");
		return 0;
	}

	render(state);

	await new Promise<void>((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		emitKeypressEvents(process.stdin);
		process.stdin.on("keypress", (character, key) => {
			const stop = onKeypress(state, character, key);
			if (stop) {
				resolve();
				return;
			}
			render(state);
		});
		process.stdout.on("resize", () => render(state));
		process.on("exit", () => process.stdout.write("\x1b[?25h"));
	});

	if (process.stdin.isTTY) process.stdin.setRawMode(false);
	process.stdin.pause();
	process.stdout.write(`${ansi.clear}${ansi.showCursor}`);
	process.stdout.write(
		`${ansi.dim}已退出；后台对话仍在 host-service 中继续运行。${ansi.reset}\n`,
	);
	return 0;
}

function emitKeypressEvents(stream: NodeJS.ReadableStream): void {
	nodeEmitKeypressEvents(stream);
}

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------

function agentShortName(harness: string): string {
	for (const [alias, full] of Object.entries(HARNESS_ALIASES)) {
		if (full === harness) return alias;
	}
	return harness;
}

async function refreshSessions(state: TuiState): Promise<void> {
	const page = await state.connection.client.acpSessions.list.query({
		limit: 50,
		workspaceId: state.workspace.id,
	});
	const previous = new Map(state.sessions.map((s) => [s.sessionId, s]));
	state.sessions = page.items.map((session) => {
		const existing = previous.get(session.sessionId);
		return {
			sessionId: session.sessionId,
			title: session.title ?? "(untitled)",
			agent: agentShortName(session.harness),
			status: session.status,
			messages: existing?.messages ?? [],
			pendingPermissions: session.pendingPermissions,
			lastSeq: session.lastSeq,
			epoch: session.epoch,
		};
	});
	if (state.currentIndex >= state.sessions.length) {
		state.currentIndex = Math.max(0, state.sessions.length - 1);
	}
}

async function loadHistory(
	state: TuiState,
	session: ChatSession,
): Promise<void> {
	const page = await state.connection.client.acpSessions.getTranscript.query({
		sessionId: session.sessionId,
		limit: 12,
	});
	session.messages = page.turns.flatMap((turn) => {
		const messages: ChatMessage[] = [];
		const userText =
			(turn.userMessage ?? []).map(contentBlockToText).join("") ||
			turn.userPreview;
		if (userText) messages.push({ role: "user", text: userText });
		const agentText =
			(turn.assistantMessage ?? []).map(contentBlockToText).join("") ||
			turn.agentPreview;
		if (agentText) messages.push({ role: "agent", text: agentText });
		return messages;
	});
}

function current(state: TuiState): ChatSession | undefined {
	return state.sessions[state.currentIndex];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(state: TuiState): void {
	if (!state.active) return;
	const frame = Frame.open(process.stdout);
	if (state.view === "conversation") renderConversation(state, frame);
	else if (state.view === "sessions") renderSessions(state, frame);
	else renderPermission(state, frame);
	frame.close();
}

function frameWidth(): number {
	return Math.max(64, Math.min(process.stdout.columns ?? 84, 100));
}

function contentWidth(): number {
	return frameWidth() - 6;
}

function displayWidth(text: string): number {
	let width = 0;
	for (const character of stripAnsi(text)) {
		const code = character.codePointAt(0) ?? 0;
		const wide =
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7af) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6);
		width += wide ? 2 : 1;
	}
	return width;
}

function padCell(text: string, target: number): string {
	const padding = Math.max(0, target - displayWidth(text));
	return `${text}${" ".repeat(padding)}`;
}

function wrapText(text: string, target: number): string[] {
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

function renderBrand(state: TuiState, frame: Frame): void {
	const session = current(state);
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print(
		`${ansi.dim}${state.workspace.name}  ·  ${session?.title ?? "无对话"}  ·  ${session?.agent ?? ""}${ansi.reset}`,
	);
	frame.print();
}

function renderMessage(frame: Frame, message: ChatMessage): void {
	if (message.role === "user") {
		const lines = wrapText(message.text, contentWidth() - 2);
		frame.print(`${ansi.bold}${ansi.cyan}❯${ansi.reset} ${lines[0]}`);
		for (const continuation of lines.slice(1)) {
			frame.print(`  ${continuation}`);
		}
		frame.print();
		return;
	}

	frame.print(`${ansi.bold}${ansi.magenta}●${ansi.reset}`);
	for (const line of renderMarkdown(message.text, renderWidth(), {
		theme: markdownThemeFor(true),
	})) {
		frame.print(` ${line}`);
	}
	frame.print();
}

function renderConversation(state: TuiState, frame: Frame): void {
	renderBrand(state, frame);
	const session = current(state);
	if (!session) {
		frame.print(
			`${ansi.dim}还没有对话。输入消息开始，或 /new 创建。${ansi.reset}`,
		);
		frame.print();
	} else {
		const messages = session.messages.slice(-state.visibleMessageCount);
		for (const message of messages) {
			renderMessage(frame, message);
		}

		if (state.streamingSessionId === session.sessionId) {
			frame.print(`${ansi.bold}${ansi.magenta}●${ansi.reset}`);
			if (state.streamingText) {
				for (const line of renderMarkdown(state.streamingText, renderWidth(), {
					theme: markdownThemeFor(true),
				})) {
					frame.print(` ${line}`);
				}
			} else {
				frame.print(` ${ansi.dim}正在思考… ✻${ansi.reset}`);
			}
			frame.print();
		}

		if (session.status === "offline") {
			frame.print(
				`${ansi.dim}  此对话已离线。发送消息时会恢复原 Agent 会话。${ansi.reset}`,
			);
			frame.print();
		}
	}

	if (state.notice) {
		const color =
			state.notice.tone === "warning"
				? ansi.yellow
				: state.notice.tone === "success"
					? ansi.green
					: ansi.cyan;
		frame.print(`${color}●${ansi.reset} ${state.notice.text}`);
		frame.print();
	}

	if (state.buffer.startsWith("/")) renderCommandMenu(state, frame);
	renderComposer(state, frame);
}

/** The slash commands matching the current buffer, for menu render + nav. */
function matchingCommands(
	state: TuiState,
): readonly (typeof slashCommands)[number][] {
	if (!state.buffer.startsWith("/")) return [];
	const query = state.buffer.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? "";
	return slashCommands.filter(([command]) =>
		command.slice(1).startsWith(query),
	);
}

function renderCommandMenu(state: TuiState, frame: Frame): void {
	const all = matchingCommands(state);
	if (all.length === 0) return;
	if (state.menuIndex >= all.length) state.menuIndex = 0;

	const width = frameWidth();
	const matches = all.slice(0, 6);
	frame.print(
		`${ansi.gray}╭─ commands ${"─".repeat(Math.max(1, width - 13))}╮${ansi.reset}`,
	);
	for (const [index, [command, description]] of matches.entries()) {
		const selected = index === state.menuIndex;
		const label = `  ${selected ? ansi.cyan : ansi.bold}${padCell(command, 16)}${selected ? ansi.reset : ansi.reset}${ansi.dim}${description}${ansi.reset}`;
		frame.print(
			`${ansi.gray}│${ansi.reset}${padCell(label, width - 2)}${ansi.gray}│${ansi.reset}`,
		);
	}
	frame.print(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);
}

function renderComposer(state: TuiState, frame: Frame): void {
	const width = frameWidth();
	const innerWidth = width - 4;
	const inputLines = wrapText(state.buffer, innerWidth - 2);
	const visibleLines = inputLines.slice(-4);
	frame.print(`${ansi.gray}╭${"─".repeat(width - 2)}╮${ansi.reset}`);

	const rendered = visibleLines.length > 0 ? visibleLines : [""];
	for (const [index, inputLine] of rendered.entries()) {
		const prefix = index === 0 ? `${ansi.bold}❯${ansi.reset} ` : "  ";
		const value = `${prefix}${inputLine}`;
		if (index === rendered.length - 1) {
			frame.setCursorTarget(
				frame.rowCount,
				displayWidth("│ ") +
					displayWidth(stripAnsi(prefix)) +
					displayWidth(inputLine),
			);
		}
		frame.print(
			`${ansi.gray}│${ansi.reset} ${padCell(value, innerWidth)} ${ansi.gray}│${ansi.reset}`,
		);
	}
	frame.print(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);

	const session = current(state);
	const left = session
		? `${session.agent} · ${statusColor(session.status)}`
		: "无对话";
	const right =
		session?.status === "running"
			? "Enter 排队 · Esc 中止"
			: "/ 命令 · Alt/ Ctrl+↑↓ 切换对话";
	const spacing = Math.max(
		2,
		width - displayWidth(left) - displayWidth(right) - 2,
	);
	frame.print(` ${left}${" ".repeat(spacing)}${ansi.dim}${right}${ansi.reset}`);
}

function statusColor(status: string): string {
	switch (status) {
		case "idle":
			return `${ansi.green}idle${ansi.reset}`;
		case "running":
			return `${ansi.cyan}working${ansi.reset}`;
		case "offline":
			return `${ansi.gray}offline${ansi.reset}`;
		case "awaiting_permission":
			return `${ansi.yellow}permission${ansi.reset}`;
		default:
			return status;
	}
}

function renderSessions(state: TuiState, frame: Frame): void {
	const width = frameWidth();
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print();
	frame.print(`${ansi.bold}选择对话${ansi.reset}`);
	frame.print(
		`${ansi.dim}输入可搜索 · ↑↓ 选择 · Enter 切换 · Esc 返回${ansi.reset}`,
	);
	frame.print();

	const filter = state.buffer.toLowerCase();
	const filtered = state.sessions
		.map((session, index) => ({ session, index }))
		.filter(({ session }) =>
			`${session.title} ${session.sessionId} ${session.agent}`
				.toLowerCase()
				.includes(filter),
		);
	if (state.selectedIndex >= filtered.length) {
		state.selectedIndex = Math.max(0, filtered.length - 1);
	}

	frame.print(`${ansi.gray}╭${"─".repeat(width - 2)}╮${ansi.reset}`);
	if (filtered.length === 0) {
		frame.print(
			`${ansi.gray}│${ansi.reset}  ${padCell(`${ansi.dim}没有匹配的对话${ansi.reset}`, width - 4)}${ansi.gray}│${ansi.reset}`,
		);
	}
	for (const [row, item] of filtered.entries()) {
		const selected = row === state.selectedIndex;
		const cursor = selected ? `${ansi.cyan}❯${ansi.reset}` : " ";
		const activeMark =
			item.index === state.currentIndex ? `${ansi.green}●${ansi.reset}` : " ";
		const titleWidth = width - 30;
		const title = truncateVisible(item.session.title, titleWidth);
		const metadata = truncateVisible(item.session.agent, 18);
		const titleCell = padCell(
			`${selected ? ansi.bold : ""}${title}${ansi.reset}`,
			titleWidth,
		);
		frame.print(
			`${ansi.gray}│${ansi.reset} ${cursor} ${activeMark} ${titleCell} ${padCell(`${ansi.dim}${metadata}${ansi.reset}`, 18)} ${ansi.gray}│${ansi.reset}`,
		);
		frame.print(
			`${ansi.gray}│${ansi.reset}       ${padCell(`${ansi.dim}${item.session.sessionId.slice(0, 8)}${ansi.reset}`, titleWidth - 2)} ${padCell(statusColor(item.session.status), 18)} ${ansi.gray}│${ansi.reset}`,
		);
	}
	frame.print(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);
	frame.print();
	const searchLabel = `搜索：${state.buffer || "输入标题、Agent 或 ID"}`;
	frame.setCursorTarget(
		frame.rowCount,
		state.buffer
			? displayWidth(`搜索：${state.buffer}`)
			: displayWidth("搜索："),
	);
	frame.print(`${ansi.dim}${searchLabel}${ansi.reset}`);
}

function renderPermission(state: TuiState, frame: Frame): void {
	const width = frameWidth();
	renderBrand(state, frame);
	const session = current(state);
	const request = session?.pendingPermissions[0];

	frame.print(
		`${ansi.yellow}${ansi.bold}${session?.agent ?? "Agent"} 请求执行命令${ansi.reset}`,
	);
	frame.print();
	frame.print(`${ansi.gray}╭${"─".repeat(width - 2)}╮${ansi.reset}`);
	frame.print(
		`${ansi.gray}│${ansi.reset}${padCell("", width - 2)}${ansi.gray}│${ansi.reset}`,
	);
	frame.print(
		`${ansi.gray}│${ansi.reset}  ${padCell(request?.toolCall.title ?? "未知命令", width - 5)} ${ansi.gray}│${ansi.reset}`,
	);
	frame.print(
		`${ansi.gray}│${ansi.reset}${padCell("", width - 2)}${ansi.gray}│${ansi.reset}`,
	);
	frame.print(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);
	frame.print();
	frame.print("是否允许执行？");
	frame.print();
	const options = permissionOptions(request);
	for (const [index, option] of options.entries()) {
		const cursor =
			index === state.permissionIndex ? `${ansi.cyan}❯${ansi.reset}` : " ";
		frame.print(` ${cursor} ${index + 1}. ${option}`);
	}
	frame.print();
	frame.print(`${ansi.dim}Enter 确认 · Esc 拒绝并返回${ansi.reset}`);
}

function permissionOptions(request: PendingPermission | undefined): string[] {
	if (!request) return ["允许一次", "拒绝"];
	const names = request.options.map((option) => option.name);
	if (names.length === 0) return ["允许一次", "拒绝"];
	return names;
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

interface Key {
	name?: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
}

/** Returns true when the TUI should stop. */
function onKeypress(
	state: TuiState,
	character: string | undefined,
	key: Key,
): boolean {
	if (!state.active) return true;

	if (state.view === "sessions") {
		handleSessionsKeys(state, character, key);
		return false;
	}
	if (state.view === "permission") {
		handlePermissionKeys(state, character, key);
		return false;
	}

	// Session switching: Alt+↑/↓ on modern terminals, Ctrl+↑/↓ everywhere
	// else. Both encodings report through keypress; plain ↑/↓ stay bound to
	// history (and the command menu when it is open).
	if (key.name === "up" && (key.meta || key.ctrl)) {
		cycleSession(state, -1);
		return false;
	}
	if (key.name === "down" && (key.meta || key.ctrl)) {
		cycleSession(state, 1);
		return false;
	}
	if (key.name === "escape") {
		const session = current(state);
		if (session?.status === "running") {
			void cancelTurn(state, session);
		}
		return false;
	}
	if (key.ctrl && key.name === "c") {
		if (state.buffer) {
			state.buffer = "";
			return false;
		}
		const now = Date.now();
		if (now - state.lastCtrlCAt < 1200) {
			state.active = false;
			return true;
		}
		state.lastCtrlCAt = now;
		state.notice = { text: "再按一次 Ctrl+C 退出", tone: "info" };
		return false;
	}
	if (key.name === "return" && key.shift) {
		state.buffer += "\n";
		return false;
	}
	if (key.ctrl && key.name === "j") {
		state.buffer += "\n";
		return false;
	}

	// While the slash-command menu is visible, ↑↓ navigate it, Enter and Tab
	// accept the highlighted entry, Esc closes it.
	const menu = matchingCommands(state);
	if (menu.length > 0) {
		if (key.name === "up") {
			state.menuIndex = Math.max(0, state.menuIndex - 1);
			return false;
		}
		if (key.name === "down") {
			state.menuIndex = Math.min(menu.length - 1, state.menuIndex + 1);
			return false;
		}
		if (key.name === "tab") {
			const [command] = menu[state.menuIndex] ?? menu[0] ?? [];
			if (command) state.buffer = `${command} `;
			return false;
		}
		if (key.name === "escape") {
			state.buffer = "";
			return false;
		}
		if (key.name === "return") {
			const [command] = menu[state.menuIndex] ?? menu[0] ?? [];
			if (command) {
				state.buffer = command;
				submit(state);
			}
			return false;
		}
	}

	if (key.name === "return") {
		submit(state);
		return false;
	}
	if (key.name === "backspace") {
		state.buffer = state.buffer.slice(0, -1);
		state.menuIndex = 0;
		return false;
	}
	if (key.name === "up" && state.inputHistory.length > 0) {
		state.historyIndex = Math.max(0, state.historyIndex - 1);
		state.buffer = state.inputHistory[state.historyIndex] ?? "";
		return false;
	}
	if (key.name === "down" && state.inputHistory.length > 0) {
		state.historyIndex = Math.min(
			state.inputHistory.length,
			state.historyIndex + 1,
		);
		state.buffer = state.inputHistory[state.historyIndex] ?? "";
		return false;
	}
	if (character && !key.ctrl && !key.meta && character >= " ") {
		state.buffer += character;
		state.menuIndex = 0;
	}
	return false;
}

function handleSessionsKeys(
	state: TuiState,
	character: string | undefined,
	key: Key,
): void {
	const filter = state.buffer.toLowerCase();
	const matches = state.sessions
		.map((session, index) => ({ session, index }))
		.filter(({ session }) =>
			`${session.title} ${session.sessionId} ${session.agent}`
				.toLowerCase()
				.includes(filter),
		);

	if (key.name === "up") {
		state.selectedIndex = Math.max(0, state.selectedIndex - 1);
	} else if (key.name === "down") {
		state.selectedIndex = Math.min(
			Math.max(0, matches.length - 1),
			state.selectedIndex + 1,
		);
	} else if (key.name === "return" && matches[state.selectedIndex]) {
		void switchTo(state, matches[state.selectedIndex]?.index ?? 0);
	} else if (key.name === "escape") {
		state.view = "conversation";
		state.buffer = "";
	} else if (key.name === "backspace") {
		state.buffer = state.buffer.slice(0, -1);
		state.selectedIndex = 0;
	} else if (character && !key.ctrl && !key.meta && character >= " ") {
		state.buffer += character;
		state.selectedIndex = 0;
	}
}

function handlePermissionKeys(
	state: TuiState,
	character: string | undefined,
	key: Key,
): void {
	const optionCount = permissionOptions(
		current(state)?.pendingPermissions[0],
	).length;
	if (key.name === "up") {
		state.permissionIndex = Math.max(0, state.permissionIndex - 1);
	} else if (key.name === "down") {
		state.permissionIndex = Math.min(
			optionCount - 1,
			state.permissionIndex + 1,
		);
	} else if (key.name === "return") {
		void resolvePermission(state, state.permissionIndex < optionCount - 1);
	} else if (key.name === "escape") {
		void resolvePermission(state, false);
	} else if (character && /^\d$/.test(character)) {
		const index = Number(character) - 1;
		if (index >= 0 && index < optionCount) {
			void resolvePermission(state, index < optionCount - 1);
		}
	}
}

function cycleSession(state: TuiState, direction: 1 | -1): void {
	if (state.sessions.length === 0) return;
	const next =
		(state.currentIndex + direction + state.sessions.length) %
		state.sessions.length;
	void switchTo(state, next);
}

async function switchTo(state: TuiState, index: number): Promise<void> {
	if (index !== state.currentIndex) {
		state.currentIndex = index;
	}
	state.visibleMessageCount = 8;
	state.buffer = "";
	state.view = "conversation";
	const session = current(state);
	state.notice = { text: `已切换到“${session?.title ?? ""}”`, tone: "success" };
	if (session && session.messages.length === 0) {
		state.notice = { text: "正在加载历史…", tone: "info" };
		try {
			await loadHistory(state, session);
			state.notice = {
				text: `已切换到“${session.title}”`,
				tone: "success",
			};
		} catch (error) {
			reportError(state, error);
		}
		// The caller's render ran before this fetch resolved; repaint with
		// the loaded history.
		render(state);
	}
}

function submit(state: TuiState): void {
	const input = state.buffer.trim();
	state.buffer = "";
	if (!input) return;
	state.inputHistory.push(input);
	state.historyIndex = state.inputHistory.length;
	if (input.startsWith("/")) {
		// Async commands (sessions refresh, /new) must repaint once their
		// awaits resolve — the keypress-driven render runs too early.
		handleCommand(state, input)
			.then(() => render(state))
			.catch((error: unknown) => {
				reportError(state, error);
				render(state);
			});
		return;
	}
	void sendMessage(state, input);
}

async function handleCommand(state: TuiState, input: string): Promise<void> {
	const [name, ...parts] = input.slice(1).trim().split(/\s+/);
	const argument = parts.join(" ");
	switch (name) {
		case "sessions":
			await refreshSessions(state);
			state.view = "sessions";
			state.selectedIndex = state.currentIndex;
			state.buffer = "";
			break;
		case "new":
			await createSession(state, argument);
			break;
		case "history":
			state.visibleMessageCount = Math.min(50, Number(argument) || 20);
			break;
		case "permissions": {
			const session = current(state);
			if (session && session.pendingPermissions.length > 0) {
				state.view = "permission";
				state.permissionIndex = 0;
			} else {
				state.notice = { text: "当前没有权限请求", tone: "info" };
			}
			break;
		}
		case "cancel": {
			const session = current(state);
			if (session) await cancelTurn(state, session);
			break;
		}
		case "clear":
			state.visibleMessageCount = 0;
			break;
		case "help":
		case "?": {
			const session = current(state);
			session?.messages.push({
				role: "agent",
				text: `## 可用命令\n\n${slashCommands
					.map(([command, description]) => `- \`${command}\` — ${description}`)
					.join(
						"\n",
					)}\n\n快捷键：\`Alt/Ctrl+↑/↓\` 切换对话，\`Esc\` 中止回合。`,
			});
			state.visibleMessageCount = 12;
			break;
		}
		case "exit":
			state.active = false;
			break;
		default:
			state.notice = { text: `未知命令：/${name}`, tone: "warning" };
	}
}

async function createSession(state: TuiState, argument: string): Promise<void> {
	const alias = argument.trim().toLowerCase();
	if (alias && !HARNESS_ALIASES[alias]) {
		state.notice = {
			text: `未知 agent：${alias}（可用：${Object.keys(HARNESS_ALIASES).join(", ")}）`,
			tone: "warning",
		};
		return;
	}
	try {
		const session = await state.connection.client.acpSessions.create.mutate({
			sessionId: crypto.randomUUID(),
			workspaceId: state.workspace.id,
			harness: alias
				? (HARNESS_ALIASES[alias] as "claude-agent-acp")
				: undefined,
		});
		state.sessions.unshift({
			sessionId: session.sessionId,
			title: session.title ?? "(untitled)",
			agent: agentShortName(session.harness),
			status: session.status,
			messages: [],
			pendingPermissions: [],
			lastSeq: session.lastSeq,
			epoch: session.epoch,
		});
		state.currentIndex = 0;
		state.view = "conversation";
		state.notice = { text: "新对话已创建", tone: "success" };
	} catch (error) {
		reportError(state, error);
	}
}

async function cancelTurn(
	state: TuiState,
	session: ChatSession,
): Promise<void> {
	if (session.status !== "running") return;
	try {
		await state.connection.client.acpSessions.cancel.mutate({
			sessionId: session.sessionId,
		});
		state.notice = { text: "已请求中止当前回合", tone: "warning" };
	} catch (error) {
		reportError(state, error);
	}
}

async function resolvePermission(
	state: TuiState,
	approved: boolean,
): Promise<void> {
	const session = current(state);
	const request = session?.pendingPermissions[0];
	state.view = "conversation";

	if (!session || !request) {
		state.notice = { text: "权限请求已不存在", tone: "info" };
		return;
	}

	const kinds = approved
		? ["allow_once", "allow_always"]
		: ["reject_once", "reject_always"];
	const option =
		request.options.find((entry) => kinds.includes(entry.kind)) ??
		request.options[0];
	if (!option) {
		state.notice = { text: "该请求没有可选项", tone: "warning" };
		return;
	}

	try {
		await state.connection.client.acpSessions.respondToPermission.mutate({
			sessionId: session.sessionId,
			requestId: request.requestId,
			outcome: makeSelectedOutcome([option.optionId]),
		});
		state.notice = {
			text: approved ? "已允许，Agent 继续执行" : "已拒绝权限请求",
			tone: approved ? "success" : "warning",
		};
	} catch (error) {
		reportError(state, error);
	}
}

async function sendMessage(state: TuiState, text: string): Promise<void> {
	const session = current(state);
	if (!session) {
		await createSession(state, "");
		const fresh = current(state);
		if (!fresh) return;
		await sendMessageTo(state, fresh, text);
		return;
	}

	if (session.pendingPermissions.length > 0) {
		state.view = "permission";
		state.permissionIndex = 0;
		return;
	}
	if (session.status === "running" || session.status === "starting") {
		try {
			await state.connection.client.acpSessions.enqueuePrompt.mutate({
				sessionId: session.sessionId,
				prompt: [{ type: "text", text } as ContentBlock],
				commandId: crypto.randomUUID(),
			});
			state.notice = {
				text: "消息已排队，将在当前回合完成后发送",
				tone: "info",
			};
		} catch (error) {
			reportError(state, error);
		}
		return;
	}
	await sendMessageTo(state, session, text);
}

async function sendMessageTo(
	state: TuiState,
	session: ChatSession,
	text: string,
): Promise<void> {
	session.messages.push({ role: "user", text });
	state.notice = undefined;

	const prompt: ContentBlock[] = [{ type: "text", text }];
	const input = {
		sessionId: session.sessionId,
		prompt,
		commandId: crypto.randomUUID(),
	};

	// Attach the stream before delivering so a short turn cannot finish
	// between delivery and subscription.
	const controller = new AbortController();
	const streaming = followTurn(state, session, controller.signal);

	try {
		await state.connection.client.acpSessions.prompt.mutate(input);
	} catch (error) {
		controller.abort();
		reportError(state, error);
		return;
	}

	await streaming;
}

/** Watch the turn we just started, updating streaming state and messages. */
async function followTurn(
	state: TuiState,
	session: ChatSession,
	signal: AbortSignal,
): Promise<void> {
	let agentText = "";
	session.status = "running";
	state.streamingSessionId = session.sessionId;
	state.streamingText = "";

	const result = await subscribeToSession(state.connection, {
		sessionId: session.sessionId,
		since: session.lastSeq,
		epoch: session.epoch,
		signal,
		onEnvelope: (envelope) => {
			const frame = envelope.frame;

			if (frame.kind === "prompt_rejected") {
				state.notice = {
					text: `请求被拒绝：${frame.reason}`,
					tone: "warning",
				};
				throw STOP_STREAM;
			}

			if (frame.kind === "permission_requested") {
				session.pendingPermissions = [frame.pending];
				session.status = "awaiting_permission";
				if (current(state) === session) {
					state.view = "permission";
					state.permissionIndex = 0;
				}
				throw STOP_STREAM;
			}

			if (frame.kind === "update") {
				const update = frame.update;
				if (update.sessionUpdate === "agent_message_chunk") {
					agentText += contentBlockToText(update.content);
					if (state.streamingSessionId === session.sessionId) {
						state.streamingText = agentText;
					}
				}
				return;
			}

			if (frame.kind === "state") {
				const status = frame.state.status;
				if (status === "idle" || status === "dead") {
					session.status = status;
					throw STOP_STREAM;
				}
				if (status === "running" || status === "starting") {
					session.status = "running";
				}
			}
		},
	});

	session.lastSeq = Math.max(session.lastSeq, result.lastSeq);
	if (agentText.trim()) {
		session.messages.push({ role: "agent", text: agentText });
	}
	if (state.streamingSessionId === session.sessionId) {
		state.streamingSessionId = undefined;
		state.streamingText = "";
	}
	if (session.status !== "awaiting_permission") {
		session.status = "idle";
	}
	if (current(state) !== session && session.status === "idle") {
		state.notice = {
			text: `后台对话“${session.title}”已完成`,
			tone: "success",
		};
	}
}

function reportError(state: TuiState, error: unknown): void {
	if (error instanceof CliError) {
		state.notice = { text: error.message, tone: "warning" };
		return;
	}
	state.notice = {
		text: error instanceof Error ? error.message : String(error),
		tone: "warning",
	};
}
