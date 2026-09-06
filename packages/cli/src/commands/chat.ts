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

import { appendFileSync } from "node:fs";
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
import { ansi, type Frame, Screen } from "../lib/tui";
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
	queuedPrompts: { queueId: string; text: string }[];
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
	["/switch", "按序号、ID 或标题切换"],
	["/new", "创建新对话"],
	["/history", "显示更多历史"],
	["/status", "查看所有对话状态"],
	["/queue", "查看排队消息"],
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
	/** Caret position in `buffer`, in UTF-16 code units (0..buffer.length). */
	cursor: number;
	selectedIndex: number;
	permissionIndex: number;
	/** Rows of transcript scrolled up from the newest line. */
	scrollOffset: number;
	notice: Notice | undefined;
	streamingSessionId: string | undefined;
	streamingText: string;
	/** Wall-clock start of the in-flight turn, for the elapsed readout. */
	turnStartedAt: number | undefined;
	spinnerTick: number;
	inputHistory: string[];
	historyIndex: number;
	/** Selected row in the slash-command menu, when it is visible. */
	menuIndex: number;
	/** True between paste-start and paste-end from bracketed paste. */
	pasting: boolean;
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
		cursor: 0,
		selectedIndex: 0,
		permissionIndex: 0,
		scrollOffset: 0,
		notice: undefined,
		streamingSessionId: undefined,
		streamingText: "",
		turnStartedAt: undefined,
		spinnerTick: 0,
		inputHistory: [],
		historyIndex: 0,
		menuIndex: 0,
		pasting: false,
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

	// Enter the alternate screen buffer so the TUI owns a clean, full-height
	// canvas and the user's prior shell scrollback is untouched — restored
	// verbatim on exit instead of being pushed around by repeated clears.
	process.stdout.write(`${ansi.enterAltScreen}${ansi.enableBracketedPaste}`);
	let screenRestored = false;
	const restoreScreen = (): void => {
		if (screenRestored) return;
		screenRestored = true;
		process.stdout.write(
			`${ansi.disableBracketedPaste}${ansi.showCursor}${ansi.exitAltScreen}`,
		);
	};
	// Covers Ctrl-C/kill signals and any exit path that skips the explicit
	// cleanup below, so the primary screen is never left showing the alt
	// buffer's last frame.
	process.on("exit", restoreScreen);

	render(state);

	await new Promise<void>((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		emitKeypressEvents(process.stdin);
		process.stdin.on("keypress", (character, key) => {
			trace(
				`keypress: ${JSON.stringify({ character, name: key?.name, ctrl: key?.ctrl, meta: key?.meta, shift: key?.shift })}`,
			);
			const stop = onKeypress(state, character, key);
			if (stop) {
				resolve();
				return;
			}
			render(state);
		});
		process.stdout.on("resize", () => {
			// A resize changes every row: drop the remembered screen so the
			// next frame repaints in full.
			screen.invalidate();
			render(state);
		});
	});

	if (process.stdin.isTTY) process.stdin.setRawMode(false);
	process.stdin.pause();
	// The spinner interval would otherwise keep the event loop alive.
	stopSpinner(state);
	restoreScreen();
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
			queuedPrompts: (session.queuedPrompts ?? []).map((entry) => ({
				queueId: entry.queueId,
				text: (entry.prompt ?? [])
					.map((block) => contentBlockToText(block))
					.join(""),
			})),
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
	limit = 20,
): Promise<void> {
	const page = await state.connection.client.acpSessions.getTranscript.query({
		sessionId: session.sessionId,
		limit,
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

/**
 * Resolve a session reference to its index: position (1-based), id prefix,
 * or a unique case-insensitive title substring. Matches the prototype's
 * /switch semantics.
 */
function findSessionIndex(
	state: TuiState,
	reference: string,
): number | undefined {
	if (!reference) return undefined;
	const numeric = Number(reference);
	if (
		Number.isInteger(numeric) &&
		numeric >= 1 &&
		numeric <= state.sessions.length
	) {
		return numeric - 1;
	}
	const byId = state.sessions.findIndex((session) =>
		session.sessionId.startsWith(reference),
	);
	if (byId >= 0) return byId;
	const lowered = reference.toLowerCase();
	const matches = state.sessions
		.map((session, index) => ({ index, title: session.title.toLowerCase() }))
		.filter(({ title }) => title.includes(lowered));
	return matches.length === 1 ? matches[0]?.index : undefined;
}

function current(state: TuiState): ChatSession | undefined {
	return state.sessions[state.currentIndex];
}

// ---------------------------------------------------------------------------
// Composer editing
// ---------------------------------------------------------------------------

/**
 * Buffer mutations funnel through these helpers so `cursor` can never drift
 * out of sync with `buffer` — a desync shows up as a caret drawn in the wrong
 * cell, which is far more confusing than a missing keybinding.
 */
function setBuffer(state: TuiState, text: string, cursor = text.length): void {
	state.buffer = text;
	state.cursor = Math.max(0, Math.min(text.length, cursor));
}

function insertAtCursor(state: TuiState, text: string): void {
	setBuffer(
		state,
		state.buffer.slice(0, state.cursor) +
			text +
			state.buffer.slice(state.cursor),
		state.cursor + text.length,
	);
}

function deleteBackward(state: TuiState): void {
	if (state.cursor === 0) return;
	// Step over a surrogate pair as one character so astral symbols and
	// emoji delete cleanly instead of leaving a lone half.
	const previous = state.buffer.codePointAt(state.cursor - 2);
	const step =
		previous !== undefined && previous > 0xffff && state.cursor >= 2 ? 2 : 1;
	setBuffer(
		state,
		state.buffer.slice(0, state.cursor - step) +
			state.buffer.slice(state.cursor),
		state.cursor - step,
	);
}

function deleteForward(state: TuiState): void {
	if (state.cursor >= state.buffer.length) return;
	const next = state.buffer.codePointAt(state.cursor);
	const step = next !== undefined && next > 0xffff ? 2 : 1;
	setBuffer(
		state,
		state.buffer.slice(0, state.cursor) +
			state.buffer.slice(state.cursor + step),
		state.cursor,
	);
}

/** Start of the word left of the caret, skipping any run of spaces first. */
function wordStart(text: string, from: number): number {
	let index = from;
	while (index > 0 && /\s/.test(text[index - 1] ?? "")) index -= 1;
	while (index > 0 && !/\s/.test(text[index - 1] ?? "")) index -= 1;
	return index;
}

/** End of the word right of the caret, skipping any run of spaces first. */
function wordEnd(text: string, from: number): number {
	let index = from;
	while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
	while (index < text.length && !/\s/.test(text[index] ?? "")) index += 1;
	return index;
}

function deleteWordBackward(state: TuiState): void {
	if (state.cursor === 0) return;
	const start = wordStart(state.buffer, state.cursor);
	setBuffer(
		state,
		state.buffer.slice(0, start) + state.buffer.slice(state.cursor),
		start,
	);
}

function deleteWordForward(state: TuiState): void {
	if (state.cursor >= state.buffer.length) return;
	const end = wordEnd(state.buffer, state.cursor);
	setBuffer(
		state,
		state.buffer.slice(0, state.cursor) + state.buffer.slice(end),
		state.cursor,
	);
}

/** One visual row of the composer, tagged with its offset into `buffer`. */
export interface ComposerLine {
	text: string;
	/** Index in `buffer` where this visual row starts. */
	start: number;
}

/**
 * Wrap composer text into visual rows while keeping each row's buffer offset.
 *
 * The offsets are what let the caret be drawn in its true cell: without them
 * the renderer can only guess, which is why the caret used to be pinned to
 * the end of the last row regardless of where edits happened.
 */
export function wrapComposer(text: string, target: number): ComposerLine[] {
	const rows: ComposerLine[] = [];
	let index = 0;
	for (const [paragraphIndex, paragraph] of text.split("\n").entries()) {
		// Account for the newline separating this paragraph from the last.
		if (paragraphIndex > 0) index += 1;
		let start = index;
		let line = "";
		let width = 0;
		for (const character of paragraph) {
			const cells = displayWidth(character);
			if (width + cells > target) {
				rows.push({ text: line, start });
				start = index;
				line = character;
				width = cells;
			} else {
				line += character;
				width += cells;
			}
			index += character.length;
		}
		rows.push({ text: line, start });
	}
	return rows;
}

/** Locate the caret as a (row, column-in-cells) pair among wrapped rows. */
export function caretPosition(
	rows: readonly ComposerLine[],
	buffer: string,
	cursor: number,
): { row: number; column: number } {
	let row = 0;
	for (const [index, line] of rows.entries()) {
		// The last row starting at or before the caret owns it, so a caret
		// sitting exactly on a wrap boundary renders on the new row.
		if (line.start <= cursor) row = index;
	}
	const start = rows[row]?.start ?? 0;
	return { row, column: displayWidth(buffer.slice(start, cursor)) };
}

/**
 * Move the caret one visual row up or down, preserving the column.
 *
 * Returns false when the caret is already on the outermost row, which is the
 * caller's signal to treat ↑/↓ as input-history navigation instead.
 */
function moveCaretVertically(state: TuiState, direction: -1 | 1): boolean {
	const rows = wrapComposer(state.buffer, composerTextWidth());
	if (rows.length < 2) return false;
	const { row, column } = caretPosition(rows, state.buffer, state.cursor);
	const targetRow = row + direction;
	const target = rows[targetRow];
	if (!target) return false;

	// Walk the target row until its accumulated width reaches the old column,
	// so the caret keeps its visual position across rows of mixed-width text.
	let offset = target.start;
	let width = 0;
	for (const character of target.text) {
		const cells = displayWidth(character);
		if (width + cells > column) break;
		width += cells;
		offset += character.length;
	}
	setBuffer(state, state.buffer, offset);
	return true;
}

/**
 * Apply an emacs-style editing key to the composer.
 *
 * Returns true when the key was an editing command, so the caller knows not
 * to fall through to submit / menu / character-insert handling. These are the
 * bindings users already have muscle memory for from every other shell and
 * terminal agent; without them the composer feels broken.
 */
function applyEditingKey(
	state: TuiState,
	character: string | undefined,
	key: Key,
): boolean {
	// Word-wise motion: Alt+←/→ on macOS terminals, Ctrl+←/→ elsewhere.
	if (key.name === "left" && (key.meta || key.ctrl)) {
		setBuffer(state, state.buffer, wordStart(state.buffer, state.cursor));
		return true;
	}
	if (key.name === "right" && (key.meta || key.ctrl)) {
		setBuffer(state, state.buffer, wordEnd(state.buffer, state.cursor));
		return true;
	}
	if (key.name === "left") {
		setBuffer(state, state.buffer, state.cursor - 1);
		return true;
	}
	if (key.name === "right") {
		setBuffer(state, state.buffer, state.cursor + 1);
		return true;
	}
	if (key.name === "home" || (key.ctrl && key.name === "a")) {
		setBuffer(state, state.buffer, 0);
		return true;
	}
	if (key.name === "end" || (key.ctrl && key.name === "e")) {
		setBuffer(state, state.buffer, state.buffer.length);
		return true;
	}
	if (key.name === "delete") {
		deleteForward(state);
		return true;
	}
	if (key.ctrl && key.name === "d" && state.buffer) {
		deleteForward(state);
		return true;
	}
	if (key.ctrl && key.name === "k") {
		setBuffer(state, state.buffer.slice(0, state.cursor), state.cursor);
		return true;
	}
	if (key.ctrl && key.name === "u") {
		setBuffer(state, state.buffer.slice(state.cursor), 0);
		return true;
	}
	if (key.ctrl && key.name === "w") {
		deleteWordBackward(state);
		return true;
	}
	if (key.meta && key.name === "backspace") {
		deleteWordBackward(state);
		return true;
	}
	if (key.meta && key.name === "d") {
		deleteWordForward(state);
		return true;
	}
	if (key.name === "backspace") {
		deleteBackward(state);
		state.menuIndex = 0;
		return true;
	}
	if (key.name === "space") {
		insertAtCursor(state, " ");
		state.menuIndex = 0;
		return true;
	}
	if (character && !key.ctrl && !key.meta && character >= " ") {
		insertAtCursor(state, character);
		state.menuIndex = 0;
		return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Frame budget: coalesce repaints and enforce a minimum interval between them.
 *
 * Besides avoiding flicker, this bounds how fast stdout can fill the pty
 * buffer: Bun stalls the event loop (and with it, in-flight HTTP) once writes
 * back up against a slow consumer. Streaming agent output arrives as many
 * chunks per second, so a per-chunk repaint would outrun the terminal — the
 * interval floor is what makes live streaming safe here.
 */
const MIN_FRAME_INTERVAL_MS = 45;

/** Opt-in keypress/paint trace, for diagnosing input or repaint stalls. */
const TRACE_PATH = process.env.SUPERSET_TUI_TRACE;
function trace(message: string): void {
	if (!TRACE_PATH) return;
	try {
		appendFileSync(TRACE_PATH, `${Date.now()} ${message}\n`);
	} catch {
		// Tracing must never take the UI down.
	}
}

let paintScheduled = false;
let lastPaintAt = 0;
let renderQueuedState: TuiState | undefined;
const screen = new Screen(process.stdout);

function render(state: TuiState): void {
	if (!state.active) return;
	renderQueuedState = state;
	if (paintScheduled) {
		return;
	}
	paintScheduled = true;
	const wait = Math.max(0, MIN_FRAME_INTERVAL_MS - (Date.now() - lastPaintAt));
	// An idle repaint lands on the next microtask (no perceptible latency);
	// bursts collapse onto the interval floor.
	if (wait === 0) queueMicrotask(paint);
	else setTimeout(paint, wait);
}

function paint(): void {
	paintScheduled = false;
	lastPaintAt = Date.now();
	const current = renderQueuedState;
	renderQueuedState = undefined;
	if (!current?.active) return;
	trace(`paint: begin view=${current.view}`);
	const frame = screen.begin();
	if (current.view === "conversation") renderConversation(current, frame);
	else if (current.view === "sessions") renderSessions(current, frame);
	else renderPermission(current, frame);
	screen.commit(frame);
	trace("paint: end");
}

/**
 * Animate the working indicator while a turn is in flight.
 *
 * The agent can go quiet for many seconds between chunks, so the spinner —
 * not the stream itself — is what tells the user the CLI is alive and still
 * attached to the turn.
 */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerTimer: ReturnType<typeof setInterval> | undefined;

function startSpinner(state: TuiState): void {
	state.turnStartedAt = Date.now();
	if (spinnerTimer) return;
	spinnerTimer = setInterval(() => {
		state.spinnerTick += 1;
		render(state);
	}, 120);
}

function stopSpinner(state: TuiState): void {
	if (spinnerTimer) {
		clearInterval(spinnerTimer);
		spinnerTimer = undefined;
	}
	state.turnStartedAt = undefined;
}

function spinnerGlyph(state: TuiState): string {
	return SPINNER_FRAMES[state.spinnerTick % SPINNER_FRAMES.length] ?? "⠋";
}

function elapsedLabel(state: TuiState): string {
	if (state.turnStartedAt === undefined) return "";
	const seconds = Math.floor((Date.now() - state.turnStartedAt) / 1000);
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
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

function brandLines(state: TuiState): string[] {
	const session = current(state);
	return [
		`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`,
		`${ansi.dim}${state.workspace.name}  ·  ${session?.title ?? "无对话"}  ·  ${session?.agent ?? ""}${ansi.reset}`,
		"",
	];
}

function messageLines(message: ChatMessage): string[] {
	if (message.role === "user") {
		const wrapped = wrapText(message.text, contentWidth() - 2);
		return [
			`${ansi.bold}${ansi.cyan}❯${ansi.reset} ${wrapped[0] ?? ""}`,
			...wrapped.slice(1).map((line) => `  ${line}`),
			"",
		];
	}
	return [
		`${ansi.bold}${ansi.magenta}●${ansi.reset}`,
		...renderMarkdown(message.text, renderWidth(), {
			theme: markdownThemeFor(true),
		}).map((line) => ` ${line}`),
		"",
	];
}

/** The full transcript as lines; the viewport decides what is on screen. */
function transcriptLines(state: TuiState): string[] {
	const session = current(state);
	if (!session) {
		return [
			`${ansi.dim}还没有对话。输入消息开始，或 /new 创建。${ansi.reset}`,
			"",
		];
	}

	const lines: string[] = [];
	for (const message of session.messages) lines.push(...messageLines(message));

	if (state.streamingSessionId === session.sessionId) {
		lines.push(`${ansi.bold}${ansi.magenta}●${ansi.reset}`);
		if (state.streamingText) {
			for (const line of renderMarkdown(state.streamingText, renderWidth(), {
				theme: markdownThemeFor(true),
			})) {
				lines.push(` ${line}`);
			}
		}
		const elapsed = elapsedLabel(state);
		lines.push(
			` ${ansi.cyan}${spinnerGlyph(state)}${ansi.reset} ${ansi.dim}${
				state.streamingText ? "生成中" : "正在思考"
			}${elapsed ? ` · ${elapsed}` : ""} · Esc 中止${ansi.reset}`,
		);
		lines.push("");
	}

	if (session.status === "offline") {
		lines.push(
			`${ansi.dim}  此对话已离线。发送消息时会恢复原 Agent 会话。${ansi.reset}`,
		);
		lines.push("");
	}
	return lines;
}

function noticeLines(state: TuiState): string[] {
	if (!state.notice) return [];
	const color =
		state.notice.tone === "warning"
			? ansi.yellow
			: state.notice.tone === "success"
				? ansi.green
				: ansi.cyan;
	return [`${color}●${ansi.reset} ${state.notice.text}`, ""];
}

/** Usable terminal height; the floor keeps tiny windows from going negative. */
function terminalRows(): number {
	return Math.max(14, process.stdout.rows ?? 24);
}

/**
 * Lay the conversation out against the real terminal height.
 *
 * The composer is pinned to the bottom and the transcript gets whatever rows
 * are left, scrolled to the newest line. Two things depend on this:
 * the screen actually looks full (no stack of content floating at the top),
 * and the frame never prints more rows than the terminal has — which would
 * scroll the screen out from under the absolute cursor positioning.
 */
function renderConversation(state: TuiState, frame: Frame): void {
	const brand = brandLines(state);
	const notice = noticeLines(state);
	const menu = state.buffer.startsWith("/") ? commandMenuLines(state) : [];
	const composer = composerBlock(state);
	const footer = footerLine(state);
	const transcript = transcriptLines(state);

	// One row is left unused: printing into the final row would scroll.
	const chrome =
		brand.length + notice.length + menu.length + composer.lines.length + 2;
	const viewport = Math.max(1, terminalRows() - chrome - 1);

	const maxScroll = Math.max(0, transcript.length - viewport);
	if (state.scrollOffset > maxScroll) state.scrollOffset = maxScroll;
	const end = transcript.length - state.scrollOffset;
	const start = Math.max(0, end - viewport);
	const visible = transcript.slice(start, end);
	const topPadding = Math.max(0, viewport - visible.length);

	for (const line of brand) frame.print(line);
	frame.print(
		start > 0
			? `${ansi.dim}  ↑ 上方还有 ${start} 行 · Shift+↑↓ / PgUp·PgDn 滚动${ansi.reset}`
			: "",
	);
	for (let index = 0; index < topPadding; index += 1) frame.print();
	for (const line of visible) frame.print(line);
	for (const line of notice) frame.print(line);
	for (const line of menu) frame.print(line);
	for (const [index, line] of composer.lines.entries()) {
		if (index === composer.caretRow) {
			frame.setCursorTarget(frame.rowCount, composer.caretColumn);
		}
		frame.print(line);
	}
	frame.print(footer);
}

/** Scroll the transcript viewport; positive moves toward older content. */
function scrollTranscript(state: TuiState, delta: number): void {
	state.scrollOffset = Math.max(0, state.scrollOffset + delta);
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

function commandMenuLines(state: TuiState): string[] {
	const all = matchingCommands(state);
	if (all.length === 0) return [];
	if (state.menuIndex >= all.length) state.menuIndex = 0;

	const width = frameWidth();
	const matches = all.slice(0, 6);
	const lines = [
		`${ansi.gray}╭─ commands ${"─".repeat(Math.max(1, width - 13))}╮${ansi.reset}`,
	];
	for (const [index, [command, description]] of matches.entries()) {
		const selected = index === state.menuIndex;
		const label = `  ${selected ? ansi.cyan : ansi.bold}${padCell(command, 16)}${ansi.reset}${ansi.dim}${description}${ansi.reset}`;
		lines.push(
			`${ansi.gray}│${ansi.reset}${padCell(label, width - 2)}${ansi.gray}│${ansi.reset}`,
		);
	}
	lines.push(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);
	return lines;
}

/** Cell width available to composer text, inside the border and prompt. */
function composerTextWidth(): number {
	return frameWidth() - 6;
}

/** Visual rows of the composer shown at once before it starts scrolling. */
const COMPOSER_MAX_ROWS = 6;

/** The composer box plus where the caret belongs inside it. */
interface ComposerBlock {
	lines: string[];
	/** Index into `lines` holding the caret. */
	caretRow: number;
	/** Zero-based terminal column for the caret. */
	caretColumn: number;
}

function composerBlock(state: TuiState): ComposerBlock {
	const width = frameWidth();
	const innerWidth = width - 4;
	const rows = wrapComposer(state.buffer, composerTextWidth());
	const caret = caretPosition(rows, state.buffer, state.cursor);

	// Scroll the composer so the caret is always on screen, even when the
	// draft is taller than the box.
	const windowStart = Math.max(
		0,
		Math.min(
			Math.max(0, rows.length - COMPOSER_MAX_ROWS),
			caret.row - COMPOSER_MAX_ROWS + 1,
		),
	);
	const visible = rows.slice(windowStart, windowStart + COMPOSER_MAX_ROWS);

	const lines = [`${ansi.gray}╭${"─".repeat(width - 2)}╮${ansi.reset}`];
	let caretRow = 1;
	let caretColumn = displayWidth("│ ") + 2;
	for (const [offset, row] of visible.entries()) {
		const rowIndex = windowStart + offset;
		const prefix = rowIndex === 0 ? `${ansi.bold}❯${ansi.reset} ` : "  ";
		if (rowIndex === caret.row) {
			caretRow = lines.length;
			caretColumn =
				displayWidth("│ ") + displayWidth(stripAnsi(prefix)) + caret.column;
		}
		lines.push(
			`${ansi.gray}│${ansi.reset} ${padCell(`${prefix}${row.text}`, innerWidth)} ${ansi.gray}│${ansi.reset}`,
		);
	}
	lines.push(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);
	return { lines, caretRow, caretColumn };
}

function footerLine(state: TuiState): string {
	const width = frameWidth();
	const session = current(state);
	const left = session
		? `${session.agent} · ${statusColor(session.status)}`
		: "无对话";
	const right =
		session?.status === "running"
			? "Enter 排队 · Esc 中止"
			: "/ 命令 · Alt/Ctrl+↑↓ 切换对话 · Ctrl+C 退出";
	const spacing = Math.max(
		2,
		width - displayWidth(left) - displayWidth(right) - 2,
	);
	return ` ${left}${" ".repeat(spacing)}${ansi.dim}${right}${ansi.reset}`;
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
	for (const line of brandLines(state)) frame.print(line);
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

	// Bracketed paste: the terminal brackets the payload with paste-start /
	// paste-end, so pasted newlines land in the draft instead of firing one
	// send per line — which is what made pasting a code block unusable.
	if (key.name === "paste-start") {
		state.pasting = true;
		return false;
	}
	if (key.name === "paste-end") {
		state.pasting = false;
		return false;
	}
	if (state.pasting) {
		if (key.name === "enter" || key.name === "return")
			insertAtCursor(state, "\n");
		else if (key.name === "tab") insertAtCursor(state, "  ");
		else if (character && character >= " ") insertAtCursor(state, character);
		return false;
	}

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
	// caret motion, history, and the command menu.
	if (key.name === "up" && (key.meta || key.ctrl)) {
		cycleSession(state, -1);
		return false;
	}
	if (key.name === "down" && (key.meta || key.ctrl)) {
		cycleSession(state, 1);
		return false;
	}
	// Transcript scrolling: Shift+↑/↓ by a line, PgUp/PgDn by a screenful.
	// Plain ↑/↓ stay with the composer, so reading back never fights typing.
	if (key.name === "up" && key.shift) {
		scrollTranscript(state, 3);
		return false;
	}
	if (key.name === "down" && key.shift) {
		scrollTranscript(state, -3);
		return false;
	}
	if (key.name === "pageup") {
		scrollTranscript(state, Math.max(4, terminalRows() - 8));
		return false;
	}
	if (key.name === "pagedown") {
		scrollTranscript(state, -Math.max(4, terminalRows() - 8));
		return false;
	}
	if (key.ctrl && key.name === "c") {
		if (state.buffer) {
			setBuffer(state, "");
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
	// Ctrl+D on an empty composer is the standard "end of input" exit.
	if (key.ctrl && key.name === "d" && !state.buffer) {
		state.active = false;
		return true;
	}
	if (key.name === "return" && key.shift) {
		insertAtCursor(state, "\n");
		return false;
	}
	// A bare LF arrives as name "enter" (Ctrl+J, and Alt+Enter where the
	// terminal sends ESC LF). readline never reports it as ctrl+j, so
	// matching the name is the only binding that actually fires.
	if (key.name === "enter" || (key.meta && key.name === "return")) {
		insertAtCursor(state, "\n");
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
			if (command) setBuffer(state, `${command} `);
			return false;
		}
		if (key.name === "escape") {
			setBuffer(state, "");
			return false;
		}
		if (key.name === "return") {
			const [command] = menu[state.menuIndex] ?? menu[0] ?? [];
			// Preserve anything already typed after the command (arguments);
			// the menu only completes the command word itself.
			if (command && state.buffer === command) setBuffer(state, command);
			submit(state);
			return false;
		}
	}

	if (key.name === "escape") {
		const session = current(state);
		if (session?.status === "running") {
			defer(() => cancelTurn(state, session as ChatSession));
		}
		return false;
	}
	if (key.name === "return") {
		submit(state);
		return false;
	}
	// In a multi-line composer ↑↓ move the caret between lines first, and
	// only reach for input history once the caret is at the outer edge.
	if (key.name === "up") {
		if (moveCaretVertically(state, -1)) return false;
		if (state.inputHistory.length > 0) {
			state.historyIndex = Math.max(0, state.historyIndex - 1);
			setBuffer(state, state.inputHistory[state.historyIndex] ?? "");
		}
		return false;
	}
	if (key.name === "down") {
		if (moveCaretVertically(state, 1)) return false;
		if (state.inputHistory.length > 0) {
			state.historyIndex = Math.min(
				state.inputHistory.length,
				state.historyIndex + 1,
			);
			setBuffer(state, state.inputHistory[state.historyIndex] ?? "");
		}
		return false;
	}
	applyEditingKey(state, character, key);
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
		defer(() => switchTo(state, matches[state.selectedIndex]?.index ?? 0));
	} else if (key.name === "escape") {
		state.view = "conversation";
		setBuffer(state, "");
	} else if (key.ctrl && key.name === "u") {
		setBuffer(state, "");
		state.selectedIndex = 0;
	} else if (key.name === "backspace") {
		setBuffer(state, state.buffer.slice(0, -1));
		state.selectedIndex = 0;
	} else if (key.name === "space") {
		setBuffer(state, `${state.buffer} `);
		state.selectedIndex = 0;
	} else if (character && !key.ctrl && !key.meta && character >= " ") {
		setBuffer(state, state.buffer + character);
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
	defer(() => switchTo(state, next));
}

async function switchTo(state: TuiState, index: number): Promise<void> {
	if (index !== state.currentIndex) {
		state.currentIndex = index;
	}
	state.scrollOffset = 0;
	setBuffer(state, "");
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

/**
 * Schedule async work started from a keypress off the readline emit call.
 *
 * Bun's readline emits keypress events synchronously while holding the
 * stream; awaits started directly in the handler can stall behind that
 * internal state. A macrotask boundary lets the async chain run on the
 * normal event loop.
 */
function defer(work: () => Promise<void>): void {
	queueMicrotask(() => {
		void work();
	});
}

function submit(state: TuiState): void {
	const input = state.buffer.trim();
	setBuffer(state, "");
	if (!input) return;
	state.inputHistory.push(input);
	state.historyIndex = state.inputHistory.length;
	if (input.startsWith("/")) {
		// Async commands (sessions refresh, /new) must repaint once their
		// awaits resolve — the keypress-driven render runs too early.
		defer(async () => {
			try {
				await handleCommand(state, input);
				render(state);
			} catch (error) {
				reportError(state, error);
				render(state);
			}
		});
		return;
	}
	defer(() => sendMessage(state, input));
}

async function handleCommand(state: TuiState, input: string): Promise<void> {
	const [name, ...parts] = input.slice(1).trim().split(/\s+/);
	const argument = parts.join(" ");
	switch (name) {
		case "sessions":
			await refreshSessions(state);
			state.view = "sessions";
			state.selectedIndex = state.currentIndex;
			setBuffer(state, "");
			break;
		case "new":
			await createSession(state, argument);
			break;
		case "switch": {
			const index = findSessionIndex(state, argument);
			if (index === undefined) {
				state.notice = {
					text: `未找到唯一匹配的对话：${argument}`,
					tone: "warning",
				};
			} else {
				await switchTo(state, index);
			}
			break;
		}
		case "status":
			await refreshSessions(state);
			state.view = "sessions";
			state.selectedIndex = state.currentIndex;
			setBuffer(state, "");
			break;
		case "queue": {
			// Queue state is already on the cached session; skip the refresh
			// so the answer renders even when the host is slow.
			const session = current(state);
			if (session) {
				if (session.queuedPrompts.length > 0) {
					session.messages.push({
						role: "agent",
						text: session.queuedPrompts
							.map((entry, index) => `${index + 1}. ${entry.text}`)
							.join("\n"),
					});
				} else {
					state.notice = { text: "当前没有排队消息", tone: "info" };
				}
			}
			break;
		}
		case "history": {
			// Reload a deeper slice of the transcript from the host, since the
			// viewport itself is already scrollable.
			const session = current(state);
			if (session) {
				await loadHistory(
					state,
					session,
					Math.min(100, Number(argument) || 40),
				);
				state.scrollOffset = 0;
				state.notice = { text: "已加载更多历史", tone: "success" };
			}
			break;
		}
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
		case "clear": {
			const session = current(state);
			if (session) session.messages = [];
			state.scrollOffset = 0;
			state.notice = {
				text: "已清空显示（/history 可重新加载）",
				tone: "info",
			};
			break;
		}
		case "help":
		case "?": {
			const session = current(state);
			const commands = slashCommands
				.map(([command, description]) => `- \`${command}\` — ${description}`)
				.join("\n");
			const shortcuts = [
				"- `Alt/Ctrl+↑/↓` 切换对话，`Esc` 中止当前回合",
				"- `Shift+↑/↓`、`PgUp/PgDn` 滚动历史",
				"- `Ctrl+J` 或 `Alt+Enter` 换行；支持多行粘贴",
				"- `←/→`、`Home/End`、`Ctrl+A/E` 移动光标；`Alt+←/→` 按词移动",
				"- `Ctrl+W` 删词，`Ctrl+U` 删到行首，`Ctrl+K` 删到行尾",
				"- `Ctrl+C` 两次退出（后台对话继续运行）",
			].join("\n");
			session?.messages.push({
				role: "agent",
				text: `## 可用命令\n\n${commands}\n\n## 快捷键\n\n${shortcuts}`,
			});
			state.scrollOffset = 0;
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
			queuedPrompts: [],
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
		render(state);
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
	// Echo the user's message immediately; the prompt round-trip below can
	// take a moment and the composer already cleared.
	render(state);

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
	startSpinner(state);
	render(state);

	try {
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
						// Repaint per chunk so output streams in view; the frame
						// budget throttles this back to a sustainable rate.
						render(state);
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
	} finally {
		stopSpinner(state);
	}

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
	render(state);
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
