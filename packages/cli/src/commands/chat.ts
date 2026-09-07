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
	FoldedTimeline,
	PendingPermission,
} from "@superset/session-protocol";
import { makeSelectedOutcome } from "@superset/session-protocol";
import { AcpSessionController } from "@superset/session-protocol/controller";
import { contentBlockToText } from "../lib/content";
import type { CommandContext } from "../lib/context";
import { CliError } from "../lib/exit-codes";
import {
	createAcpSessionsApi,
	type HostConnection,
	sessionStreamUrl,
} from "../lib/host-connection";
import { renderMarkdown } from "../lib/markdown";
import { stripAnsi, truncateVisible } from "../lib/output";
import { RenderCache } from "../lib/render-cache";
import {
	type CatalogView,
	loadCatalog,
	type ProjectRef,
	resolveWorkspace,
	type WorkspaceRef,
	workspaceForDirectory,
} from "../lib/resolve";
import { ansi, type Frame, Screen } from "../lib/tui";
import { markdownThemeFor } from "./sessions/shared";

type View =
	| "conversation"
	| "sessions"
	| "project-select"
	| "workspace-select"
	| "agent-select"
	| "creating-session"
	| "model-select"
	| "permission";

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
	createdAt: number;
	updatedAt: number;
	epoch?: string;
}

type Notice = { text: string; tone: "info" | "success" | "warning" };

const RECENT_SESSION_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export interface RecentSessionCandidate {
	sessionId: string;
	createdAt: number;
	updatedAt: number;
}

/** The interactive CLI is a recent-work surface, not a session archive. */
export function recentSessionCandidates<T extends RecentSessionCandidate>(
	sessions: readonly T[],
	now = Date.now(),
): T[] {
	const cutoff = now - RECENT_SESSION_WINDOW_MS;
	return sessions
		.filter((session) => session.updatedAt >= cutoff)
		.sort(
			(a, b) =>
				b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId),
		);
}

const HARNESS_ALIASES: Record<string, string> = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
	deepseek: "deepseek-acp",
};

const slashCommands = [
	["/projects", "切换项目"],
	["/sessions", "切换对话"],
	["/switch", "按序号、ID 或标题切换"],
	["/new", "创建新对话"],
	["/model", "选择当前对话模型"],
	["/history", "显示更多历史"],
	["/status", "查看所有对话状态"],
	["/queue", "查看排队消息"],
	["/permissions", "处理权限请求"],
	["/cancel", "中止当前回合"],
	["/clear", "清理对话显示"],
	["/help", "查看命令"],
	["/exit", "退出"],
] as const;

export interface TuiState {
	connection: HostConnection;
	catalog: CatalogView;
	workspace: WorkspaceRef;
	sessions: ChatSession[];
	currentIndex: number;
	view: View;
	buffer: string;
	/** Caret position in `buffer`, in UTF-16 code units (0..buffer.length). */
	cursor: number;
	selectedIndex: number;
	permissionIndex: number;
	projectIndex: number;
	workspaceIndex: number;
	agentIndex: number;
	modelIndex: number;
	modelOptions: { value: string; name: string; description?: string | null }[];
	hasSelectedProject?: boolean;
	projectSelectionMode?: "create" | "switch";
	newConversationProject: ProjectRef | undefined;
	newConversationWorkspace: WorkspaceRef | undefined;
	/** Rows of transcript scrolled up from the newest line. */
	scrollOffset: number;
	notice: Notice | undefined;
	/** Session whose shared ACP controller is currently attached. */
	attachedSessionId: string | undefined;
	controller: AcpSessionController | undefined;
	streamingSessionId: string | undefined;
	streamingText: string;
	/** Latest useful activity reported by the agent while a turn is running. */
	activityText: string | undefined;
	/** Wall-clock start of the in-flight turn, for the elapsed readout. */
	turnStartedAt: number | undefined;
	spinnerTick: number;
	inputHistory: string[];
	historyIndex: number;
	/** Selected row in the slash-command menu, when it is visible. */
	menuIndex: number;
	/** True between paste-start and paste-end from bracketed paste. */
	pasting: boolean;
	/** Bytes after an SGR mouse prefix while readline emits them as keys. */
	pendingMouseInput: string | undefined;
	active: boolean;
	/** Whether the user has entered a concrete conversation from the launcher. */
	hasOpenedConversation: boolean;
	lastCtrlCAt: number;
	/** Resolve the outer input loop when an async slash command exits. */
	requestExit?: () => void;
}

export async function chatCommand(ctx: CommandContext): Promise<number> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);
	const reference = ctx.args.options.get("workspace")?.[0];
	const workspace = reference
		? resolveWorkspace(catalog.workspaces, reference, process.cwd())
		: (workspaceForDirectory(catalog.workspaces, process.cwd()) ??
			catalog.workspaces[0]);
	if (!workspace) {
		process.stdout.write("没有可用项目，请先在 Superset 中添加项目。\n");
		return 0;
	}

	const state: TuiState = {
		connection,
		catalog,
		workspace,
		sessions: [],
		currentIndex: 0,
		view: "conversation",
		buffer: "",
		cursor: 0,
		selectedIndex: 0,
		permissionIndex: 0,
		projectIndex: 0,
		workspaceIndex: 0,
		agentIndex: 0,
		modelIndex: 0,
		modelOptions: [],
		newConversationProject: undefined,
		newConversationWorkspace: undefined,
		scrollOffset: 0,
		notice: undefined,
		streamingSessionId: undefined,
		attachedSessionId: undefined,
		controller: undefined,
		streamingText: "",
		activityText: undefined,
		turnStartedAt: undefined,
		spinnerTick: 0,
		inputHistory: [],
		historyIndex: 0,
		menuIndex: 0,
		pasting: false,
		pendingMouseInput: undefined,
		active: true,
		hasOpenedConversation: false,
		lastCtrlCAt: 0,
	};

	// Directory / --workspace only preselects a project; no session query is
	// issued until the user explicitly chooses the project to work in.
	state.hasSelectedProject = false;
	openProjectSelect(state, "switch");

	if (process.stdin.isTTY !== true) {
		process.stdout.write("交互模式需要终端。非交互使用请运行子命令。\n");
		return 0;
	}

	// Enter the alternate screen buffer so the TUI owns a clean, full-height
	// canvas and the user's prior shell scrollback is untouched — restored
	// verbatim on exit instead of being pushed around by repeated clears.
	process.stdout.write(
		`${ansi.enterAltScreen}${ansi.enableBracketedPaste}${ansi.enableMouseTracking}`,
	);
	let screenRestored = false;
	const restoreScreen = (): void => {
		if (screenRestored) return;
		screenRestored = true;
		process.stdout.write(
			`${ansi.disableMouseTracking}${ansi.disableBracketedPaste}${ansi.showCursor}${ansi.exitAltScreen}`,
		);
	};
	// Covers Ctrl-C/kill signals and any exit path that skips the explicit
	// cleanup below, so the primary screen is never left showing the alt
	// buffer's last frame.
	process.on("exit", restoreScreen);

	render(state);

	await new Promise<void>((resolve) => {
		let resolved = false;
		const finish = (): void => {
			if (resolved) return;
			resolved = true;
			state.active = false;
			resolve();
		};
		state.requestExit = finish;
		process.stdin.setRawMode(true);
		process.stdin.resume();
		emitKeypressEvents(process.stdin);
		process.stdin.on("keypress", (character, key) => {
			if (consumeMouseInput(state, character, key)) return;
			trace(
				`keypress: ${JSON.stringify({ character, name: key?.name, ctrl: key?.ctrl, meta: key?.meta, shift: key?.shift })}`,
			);
			const stop = onKeypress(state, character, key);
			if (stop) {
				finish();
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
	state.requestExit = undefined;

	if (process.stdin.isTTY) process.stdin.setRawMode(false);
	process.stdin.pause();
	// The spinner interval would otherwise keep the event loop alive.
	stopSpinner(state);
	state.controller?.stop();
	state.controller = undefined;
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

export async function refreshSessions(state: TuiState): Promise<void> {
	const items: Awaited<
		ReturnType<typeof state.connection.client.acpSessions.list.query>
	>["items"] = [];
	let cursor: string | undefined;
	do {
		const page = await state.connection.client.acpSessions.list.query({
			cursor,
			excludeEmpty: true,
			limit: 50,
			workspaceId: state.workspace.id,
		});
		items.push(...page.items);
		cursor = page.nextCursor ?? undefined;
	} while (cursor);

	const currentSessionId = current(state)?.sessionId;
	const previous = new Map(state.sessions.map((s) => [s.sessionId, s]));
	const recent = recentSessionCandidates(items);
	state.sessions = recent.map((session) => {
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
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			epoch: session.epoch,
		};
	});
	const retainedIndex = currentSessionId
		? state.sessions.findIndex(
				(session) => session.sessionId === currentSessionId,
			)
		: -1;
	if (retainedIndex >= 0) {
		state.currentIndex = retainedIndex;
	} else if (state.currentIndex >= state.sessions.length) {
		state.currentIndex = Math.max(0, state.sessions.length - 1);
	}
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
	else if (current.view === "project-select")
		renderProjectSelect(current, frame);
	else if (current.view === "workspace-select")
		renderWorkspaceSelect(current, frame);
	else if (current.view === "agent-select") renderAgentSelect(current, frame);
	else if (current.view === "creating-session")
		renderCreatingSession(current, frame);
	else if (current.view === "model-select") renderModelSelect(current, frame);
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
	state.turnStartedAt ??= Date.now();
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
	return Math.max(64, process.stdout.columns ?? 84);
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

function relativeActivity(timestamp: number, now = Date.now()): string {
	const elapsed = Math.max(0, now - timestamp);
	const minutes = Math.floor(elapsed / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	return `${Math.floor(hours / 24)} 天前`;
}

function statusLabel(status: string): string {
	switch (status) {
		case "idle":
			return "就绪";
		case "running":
		case "starting":
			return "执行中";
		case "offline":
			return "可恢复";
		case "awaiting_permission":
			return "待确认";
		case "dead":
			return "已结束";
		default:
			return status;
	}
}

function brandLines(state: TuiState): string[] {
	const session = current(state);
	return [
		`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`,
		`${ansi.dim}${state.workspace.name}  ·  ${session?.title ?? "无对话"}  ·  ${session?.agent ?? ""}${ansi.reset}`,
		"",
	];
}

function hangingMessageLines(
	marker: string,
	text: string,
	role: ChatMessage["role"],
): string[] {
	const markerPlainWidth = displayWidth(stripAnsi(marker));
	const bodyWidth = Math.max(1, contentWidth() - markerPlainWidth);
	if (role === "user") {
		const wrapped = wrapText(text, bodyWidth);
		return [
			`${marker}${ansi.cyan}${wrapped[0] ?? ""}${ansi.reset}`,
			...wrapped
				.slice(1)
				.map(
					(line) =>
						`${" ".repeat(markerPlainWidth)}${ansi.cyan}${line}${ansi.reset}`,
				),
			"",
		];
	}
	const rendered = renderMarkdown(text.trim(), bodyWidth, {
		theme: markdownThemeFor(true),
		paddingX: 0,
	});
	if (rendered.length === 0) return [];
	return [marker.trimEnd(), "", ...rendered.map((line) => `  ${line}`), ""];
}

/** Claude layout: role glyph on the first line, hanging body indentation. */
export function messageLines(
	message: ChatMessage,
	agentName = "Agent",
): string[] {
	return hangingMessageLines(
		message.role === "user"
			? `${ansi.bold}${ansi.cyan}❯${ansi.reset} `
			: `${ansi.bold}${ansi.magenta}● ${agentName}${ansi.reset} `,
		message.text,
		message.role,
	);
}

const transcriptRenderCache = new RenderCache();

export function cachedMessageLines(
	message: ChatMessage,
	agentName: string,
): readonly string[] {
	return transcriptRenderCache.get(
		JSON.stringify([contentWidth(), message.role, agentName, message.text]),
		() => messageLines(message, agentName),
	);
}

/** The full transcript as lines; the viewport decides what is on screen. */
function transcriptLines(state: TuiState): string[] {
	const session = current(state);
	if (!session) {
		return [
			`${ansi.bold}最近两天没有对话${ansi.reset}`,
			`${ansi.dim}直接输入消息开始，或用 /new <agent> 创建。${ansi.reset}`,
			"",
		];
	}

	const lines: string[] = [];
	for (const message of session.messages) {
		lines.push(...cachedMessageLines(message, session.agent));
	}

	if (state.streamingSessionId === session.sessionId) {
		if (state.streamingText) {
			const rendered = hangingMessageLines(
				`${ansi.bold}${ansi.magenta}● ${session.agent}${ansi.reset} `,
				state.streamingText,
				"agent",
			);
			// The working indicator below owns the trailing spacing while streaming.
			if (rendered.at(-1) === "") rendered.pop();
			lines.push(...rendered);
		} else {
			lines.push(`${ansi.bold}${ansi.magenta}● ${session.agent}${ansi.reset}`);
			lines.push("");
		}
		const elapsed = elapsedLabel(state);
		const activity =
			state.activityText ??
			(state.streamingText
				? `${session.agent} 正在组织回复`
				: `${session.agent} 正在思考`);
		lines.push(
			` ${ansi.cyan}${spinnerGlyph(state)}${ansi.reset} ${ansi.dim}${activity}${
				elapsed ? ` · ${elapsed}` : ""
			} · Esc 中止${ansi.reset}`,
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

export function noticeLines(state: Pick<TuiState, "notice">): string[] {
	// Routine acknowledgements must not occupy space above the composer.
	if (state.notice?.tone !== "warning") return [];
	return [`${ansi.yellow}●${ansi.reset} ${state.notice.text}`, ""];
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
	const bottomPadding = Math.max(0, viewport - visible.length);

	for (const line of brand) frame.print(line);
	frame.print(
		start > 0
			? `${ansi.dim}  ↑ 上方还有 ${start} 行 · ↑↓ / PgUp·PgDn 滚动${ansi.reset}`
			: "",
	);
	for (const line of visible) frame.print(line);
	// Anchor short conversations below the header; unused space separates the
	// transcript from the composer instead of pushing new messages downward.
	for (let index = 0; index < bottomPadding; index += 1) frame.print();
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

export function selectedSlashCommandInput(
	buffer: string,
	command: string | undefined,
): string {
	if (!command) return buffer;
	const argumentStart = buffer.search(/\s/);
	return argumentStart < 0
		? command
		: `${command}${buffer.slice(argumentStart)}`;
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

/** Cell width available to composer text below Claude's `❯ ` prompt. */
function composerTextWidth(): number {
	return frameWidth() - 2;
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

export function claudeComposerLines(
	rows: readonly ComposerLine[],
	width: number,
	windowStart = 0,
): string[] {
	const rule = `${ansi.gray}${"─".repeat(width)}${ansi.reset}`;
	return [
		rule,
		...rows.map((row, offset) => {
			const rowIndex = windowStart + offset;
			const prefix = rowIndex === 0 ? `${ansi.bold}❯${ansi.reset} ` : "  ";
			return `${prefix}${row.text}`;
		}),
		rule,
	];
}

function composerBlock(state: TuiState): ComposerBlock {
	const width = frameWidth();
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

	// Claude Code uses full-width horizontal rules around a borderless input
	// row. The prompt sits directly below the top rule; wrapped lines hang from
	// the text column instead of being enclosed in a box.
	const lines = claudeComposerLines(visible, width, windowStart);
	let caretRow = 1;
	let caretColumn = displayWidth("❯ ");
	for (const [offset] of visible.entries()) {
		const rowIndex = windowStart + offset;
		const prefix = rowIndex === 0 ? `${ansi.bold}❯${ansi.reset} ` : "  ";
		if (rowIndex === caret.row) {
			caretRow = offset + 1;
			caretColumn = displayWidth(stripAnsi(prefix)) + caret.column;
		}
	}
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
			? "Enter 排队 · Ctrl+L 列表 · Esc 中止"
			: "/ 命令 · ↑↓/滚轮翻阅 · Esc/Ctrl+L 列表";
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
	frame.print(
		`${ansi.bold}${state.workspace.name} · 最近两天的对话${ansi.reset}`,
	);
	frame.print(
		`${ansi.dim}${state.sessions.length} 个 · ↑↓ 选择 · Enter 打开 · Ctrl+P 切换项目 · 输入搜索 · Esc 退出${ansi.reset}`,
	);
	frame.print();

	const filter = state.buffer.toLowerCase();
	const sessionEntries = state.sessions
		.map((session, index) => ({ kind: "session" as const, session, index }))
		.filter(({ session }) =>
			`${session.title} ${session.sessionId} ${session.agent}`
				.toLowerCase()
				.includes(filter),
		);
	const filtered = [
		...(filter ? [] : [{ kind: "new" as const }]),
		...sessionEntries,
	];
	if (state.selectedIndex >= filtered.length) {
		state.selectedIndex = Math.max(0, filtered.length - 1);
	}

	frame.print(`${ansi.gray}╭${"─".repeat(width - 2)}╮${ansi.reset}`);
	if (filtered.length === 0) {
		frame.print(
			`${ansi.gray}│${ansi.reset}  ${padCell(`${ansi.dim}没有匹配的对话${ansi.reset}`, width - 4)}${ansi.gray}│${ansi.reset}`,
		);
	}
	// Each session occupies two rows. Keep the picker inside the terminal and
	// window around the selection instead of printing all 50 results, which
	// would scroll the alternate screen and make navigation appear broken.
	const visibleCount = Math.max(1, Math.floor((terminalRows() - 9) / 2));
	const windowStart = Math.max(
		0,
		Math.min(
			Math.max(0, filtered.length - visibleCount),
			state.selectedIndex - Math.floor(visibleCount / 2),
		),
	);
	const visible = filtered.slice(windowStart, windowStart + visibleCount);
	for (const [visibleRow, item] of visible.entries()) {
		const row = windowStart + visibleRow;
		const selected = row === state.selectedIndex;
		const cursor = selected ? `${ansi.cyan}❯${ansi.reset}` : " ";
		if (item.kind === "new") {
			frame.print(
				`${ansi.gray}│${ansi.reset} ${cursor} ${ansi.green}+${ansi.reset} ${padCell(`${ansi.bold}新建对话${ansi.reset}`, width - 10)} ${ansi.gray}│${ansi.reset}`,
			);
			frame.print(
				`${ansi.gray}│${ansi.reset}       ${padCell(`${ansi.dim}选择 Agent 后创建${ansi.reset}`, width - 8)} ${ansi.gray}│${ansi.reset}`,
			);
			continue;
		}
		const activeMark =
			item.index === state.currentIndex ? `${ansi.green}●${ansi.reset}` : " ";
		const titleWidth = Math.max(8, width - 38);
		const title = truncateVisible(item.session.title, titleWidth);
		const metadata = truncateVisible(
			`${item.session.agent} · ${statusLabel(item.session.status)} · ${relativeActivity(item.session.updatedAt)}`,
			26,
		);
		const titleCell = padCell(
			`${selected ? ansi.bold : ""}${title}${ansi.reset}`,
			titleWidth,
		);
		frame.print(
			`${ansi.gray}│${ansi.reset} ${cursor} ${activeMark} ${titleCell} ${padCell(`${ansi.dim}${metadata}${ansi.reset}`, 26)} ${ansi.gray}│${ansi.reset}`,
		);
		frame.print(
			`${ansi.gray}│${ansi.reset}       ${padCell(`${ansi.dim}${item.session.sessionId.slice(0, 8)}${ansi.reset}`, titleWidth - 2)} ${padCell(statusColor(item.session.status), 26)} ${ansi.gray}│${ansi.reset}`,
		);
	}
	frame.print(`${ansi.gray}╰${"─".repeat(width - 2)}╯${ansi.reset}`);
	if (filtered.length > visible.length) {
		const first = windowStart + 1;
		const last = windowStart + visible.length;
		frame.print(
			`${ansi.dim}显示 ${first}–${last} / ${filtered.length} · 继续用 ↑↓ 浏览${ansi.reset}`,
		);
	} else {
		frame.print();
	}
	const searchLabel = `搜索：${state.buffer || "输入标题、Agent 或 ID"}`;
	frame.setCursorTarget(
		frame.rowCount,
		state.buffer
			? displayWidth(`搜索：${state.buffer}`)
			: displayWidth("搜索："),
	);
	frame.print(`${ansi.dim}${searchLabel}${ansi.reset}`);
}

export function sessionPickerEntries<T>(
	sessions: readonly T[],
	filter: string,
) {
	return [
		...(filter ? [] : [{ kind: "new" as const }]),
		...sessions.map((session, index) => ({
			kind: "session" as const,
			session,
			index,
		})),
	];
}

const AGENT_CHOICES = Object.entries(HARNESS_ALIASES).map(
	([alias, harness]) => ({
		alias,
		harness,
	}),
);

function renderProjectSelect(state: TuiState, frame: Frame): void {
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print();
	frame.print(`${ansi.bold}选择项目${ansi.reset}`);
	frame.print(
		`${ansi.dim}${state.projectSelectionMode === "switch" ? "切换项目并浏览已有对话" : "新对话将创建在所选项目中"} · ↑↓ 选择 · Enter 下一步 · Esc 返回${ansi.reset}`,
	);
	frame.print();
	for (const line of noticeLines(state)) frame.print(line);
	const countVisible = Math.max(1, Math.floor((terminalRows() - 9) / 3));
	const start = Math.max(0, state.projectIndex - countVisible + 1);
	for (const [offset, project] of state.catalog.projects
		.slice(start, start + countVisible)
		.entries()) {
		const index = start + offset;
		const cursor =
			index === state.projectIndex ? `${ansi.cyan}❯${ansi.reset}` : " ";
		const count = state.catalog.workspaces.filter(
			(workspace) => workspace.projectId === project.id,
		).length;
		frame.print(` ${cursor} ${ansi.bold}${project.name}${ansi.reset}`);
		frame.print(
			`   ${ansi.dim}${count} workspace${count === 1 ? "" : "s"} · ${project.repoPath}${ansi.reset}`,
		);
		frame.print();
	}
}

export function workspacesForProject(
	workspaces: readonly WorkspaceRef[],
	projectId: string,
): WorkspaceRef[] {
	return workspaces.filter((workspace) => workspace.projectId === projectId);
}

function selectedProjectWorkspaces(state: TuiState): WorkspaceRef[] {
	return state.newConversationProject
		? workspacesForProject(
				state.catalog.workspaces,
				state.newConversationProject.id,
			)
		: [];
}

function renderWorkspaceSelect(state: TuiState, frame: Frame): void {
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print();
	frame.print(
		`${ansi.bold}${state.newConversationProject?.name ?? "项目"} · 选择 Workspace${ansi.reset}`,
	);
	frame.print(`${ansi.dim}↑↓ 选择 · Enter 下一步 · Esc 返回${ansi.reset}`);
	frame.print();
	for (const line of noticeLines(state)) frame.print(line);
	const countVisible = Math.max(1, Math.floor((terminalRows() - 9) / 3));
	const start = Math.max(0, state.workspaceIndex - countVisible + 1);
	for (const [offset, workspace] of selectedProjectWorkspaces(state)
		.slice(start, start + countVisible)
		.entries()) {
		const index = start + offset;
		const cursor =
			index === state.workspaceIndex ? `${ansi.cyan}❯${ansi.reset}` : " ";
		frame.print(` ${cursor} ${ansi.bold}${workspace.name}${ansi.reset}`);
		frame.print(
			`   ${ansi.dim}${workspace.branch} · ${workspace.type}${ansi.reset}`,
		);
		frame.print();
	}
}

function renderAgentSelect(state: TuiState, frame: Frame): void {
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print();
	frame.print(`${ansi.bold}选择 Agent${ansi.reset}`);
	frame.print(
		`${ansi.dim}${state.newConversationProject?.name ?? ""} · ${state.newConversationWorkspace?.name ?? ""} · ↑↓ 选择 · Enter 创建 · Esc 返回${ansi.reset}`,
	);
	frame.print();
	for (const [index, choice] of AGENT_CHOICES.entries()) {
		const cursor =
			index === state.agentIndex ? `${ansi.cyan}❯${ansi.reset}` : " ";
		frame.print(` ${cursor} ${ansi.bold}${choice.alias}${ansi.reset}`);
		frame.print(
			`   ${ansi.dim}${choice.harness}${choice.alias === "claude" ? " · 默认" : ""}${ansi.reset}`,
		);
		frame.print();
	}
}

function renderCreatingSession(state: TuiState, frame: Frame): void {
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print();
	frame.print(`${ansi.bold}正在创建新对话${ansi.reset}`);
	frame.print();
	frame.print(
		` ${ansi.cyan}${spinnerGlyph(state)}${ansi.reset} ${state.newConversationProject?.name ?? ""} · ${state.newConversationWorkspace?.name ?? ""}`,
	);
	frame.print(
		`   ${ansi.dim}${AGENT_CHOICES[state.agentIndex]?.alias ?? "agent"} 正在启动，请稍候…${ansi.reset}`,
	);
}

function renderModelSelect(state: TuiState, frame: Frame): void {
	frame.print(`${ansi.bold}${ansi.magenta}✦ Superset${ansi.reset}`);
	frame.print();
	frame.print(`${ansi.bold}选择模型${ansi.reset}`);
	frame.print(`${ansi.dim}↑↓ 选择 · Enter 应用 · Esc 返回${ansi.reset}`);
	frame.print();
	const visibleCount = Math.max(1, terminalRows() - 7);
	const start = Math.max(
		0,
		Math.min(
			Math.max(0, state.modelOptions.length - visibleCount),
			state.modelIndex - Math.floor(visibleCount / 2),
		),
	);
	for (const [offset, option] of state.modelOptions
		.slice(start, start + visibleCount)
		.entries()) {
		const selected = start + offset === state.modelIndex;
		const cursor = selected ? `${ansi.cyan}❯${ansi.reset}` : " ";
		frame.print(` ${cursor} ${ansi.bold}${option.name}${ansi.reset}`);
		if (option.description) {
			frame.print(`   ${ansi.dim}${option.description}${ansi.reset}`);
		}
	}
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
	sequence?: string;
	name?: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
}

export interface MouseScroll {
	delta: number;
}

export function consumeMouseInput(
	state: TuiState,
	character: string | undefined,
	key: Key,
): boolean {
	if (state.pendingMouseInput !== undefined) {
		const body = state.pendingMouseInput + (character ?? "");
		if (character && /^[0-9;]*[Mm]$/.test(body)) {
			const mouse = parseMouseScrollBody(body);
			state.pendingMouseInput = undefined;
			if (mouse && state.view === "conversation") {
				scrollTranscript(state, mouse.delta);
				render(state);
			}
			return true;
		}
		if (character && /^[0-9;]{1,32}$/.test(body)) {
			state.pendingMouseInput = body;
			return true;
		}
		// A malformed/truncated report must not trap all future keypresses.
		state.pendingMouseInput = undefined;
	}
	// Readline labels many unsupported keys "undefined", not just the mouse
	// prefix. Match the actual sequence, otherwise ordinary typing is swallowed.
	if (key.sequence === "\u001b[<") {
		state.pendingMouseInput = "";
		return true;
	}
	return false;
}

/** Decode the report body that readline emits after consuming SGR `ESC[<`. */
export function parseMouseScrollBody(input: string): MouseScroll | undefined {
	const match = input.match(/^(64|65);\d+;\d+[Mm]$/);
	if (!match) return undefined;
	return { delta: match[1] === "64" ? 3 : -3 };
}

export function isComposerSubmitKey(key: Key): boolean {
	return key.name === "return" || key.name === "enter";
}

export function isComposerNewlineKey(key: Key): boolean {
	return isComposerSubmitKey(key) && Boolean(key.shift || key.meta);
}

/** Returns true when the TUI should stop. */
export function onKeypress(
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
		return !state.active;
	}
	if (state.view === "project-select") {
		handleProjectSelectKeys(state, key);
		return false;
	}
	if (state.view === "workspace-select") {
		handleWorkspaceSelectKeys(state, key);
		return false;
	}
	if (state.view === "agent-select") {
		handleAgentSelectKeys(state, key);
		return false;
	}
	if (state.view === "creating-session") {
		// Creation is already admitted; consume input so repeated Enter cannot
		// create duplicate sessions while the adapter starts.
		return false;
	}
	if (state.view === "model-select") {
		handleModelSelectKeys(state, key);
		return false;
	}
	if (state.view === "permission") {
		handlePermissionKeys(state, character, key);
		return false;
	}

	if (key.ctrl && key.name === "l") {
		showSessionList(state);
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
	if (isComposerNewlineKey(key)) {
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
		if (isComposerSubmitKey(key)) {
			const [command] = menu[state.menuIndex] ?? menu[0] ?? [];
			// Enter executes the highlighted menu entry. Replace the typed prefix
			// (`/s`, `/sta`, …) while retaining any already-entered arguments.
			setBuffer(state, selectedSlashCommandInput(state.buffer, command));
			submit(state);
			return false;
		}
	}

	if (key.name === "escape") {
		const session = current(state);
		if (session?.status === "running") {
			defer(state, () => cancelTurn(state, session as ChatSession));
		} else {
			showSessionList(state);
		}
		return false;
	}
	if (isComposerSubmitKey(key)) {
		submit(state);
		return false;
	}
	// With an empty composer, plain ↑/↓ directly browse the conversation.
	// Draft history remains available once the user has started typing.
	if (key.name === "up" && !state.buffer) {
		scrollTranscript(state, 3);
		return false;
	}
	if (key.name === "down" && !state.buffer) {
		scrollTranscript(state, -3);
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

function showSessionList(state: TuiState): void {
	setBuffer(state, "");
	state.view = "sessions";
	// The first row is the synthetic new-conversation entry.
	state.selectedIndex = state.sessions.length ? state.currentIndex + 1 : 0;
}

function openProjectSelect(
	state: TuiState,
	mode: "create" | "switch" = "create",
): void {
	state.projectSelectionMode = mode;
	state.notice = undefined;
	state.view = "project-select";
	state.projectIndex = Math.max(
		0,
		state.catalog.projects.findIndex(
			(project) => project.id === state.workspace.projectId,
		),
	);
	state.newConversationProject = undefined;
	state.newConversationWorkspace = undefined;
	setBuffer(state, "");
}

function handleProjectSelectKeys(state: TuiState, key: Key): void {
	if (key.name === "up") {
		state.projectIndex = Math.max(0, state.projectIndex - 1);
	} else if (key.name === "down") {
		state.projectIndex = Math.min(
			state.catalog.projects.length - 1,
			state.projectIndex + 1,
		);
	} else if (isComposerSubmitKey(key)) {
		const project = state.catalog.projects[state.projectIndex];
		if (!project) return;
		state.newConversationProject = project;
		const workspaces = workspacesForProject(
			state.catalog.workspaces,
			project.id,
		);
		if (workspaces.length === 1 && workspaces[0]) {
			selectProjectWorkspace(state, workspaces[0]);
		} else if (workspaces.length > 1) {
			state.workspaceIndex = 0;
			state.view = "workspace-select";
		} else {
			state.notice = { text: "该项目没有可用 Workspace", tone: "warning" };
		}
	} else if (key.name === "escape") {
		if (state.hasSelectedProject === false) state.requestExit?.();
		else state.view = "sessions";
	}
}

function handleWorkspaceSelectKeys(state: TuiState, key: Key): void {
	const workspaces = selectedProjectWorkspaces(state);
	if (key.name === "up") {
		state.workspaceIndex = Math.max(0, state.workspaceIndex - 1);
	} else if (key.name === "down") {
		state.workspaceIndex = Math.min(
			workspaces.length - 1,
			state.workspaceIndex + 1,
		);
	} else if (isComposerSubmitKey(key)) {
		const workspace = workspaces[state.workspaceIndex];
		if (!workspace) return;
		selectProjectWorkspace(state, workspace);
	} else if (key.name === "escape") {
		state.view = "project-select";
	}
}

function selectProjectWorkspace(
	state: TuiState,
	workspace: WorkspaceRef,
): void {
	if (state.projectSelectionMode === "switch") {
		defer(state, () => switchProjectWorkspace(state, workspace));
	} else {
		state.newConversationWorkspace = workspace;
		openAgentSelect(state);
	}
}

export async function switchProjectWorkspace(
	state: TuiState,
	workspace: WorkspaceRef,
): Promise<void> {
	// Fetch before committing the switch so an unreachable host cannot wipe
	// the current conversation or leave its live subscription half-detached.
	const target = { ...state, workspace, sessions: [], currentIndex: 0 };
	await refreshSessions(target);
	state.controller?.stop();
	state.controller = undefined;
	state.attachedSessionId = undefined;
	stopSpinner(state);
	state.workspace = workspace;
	state.hasSelectedProject = true;
	state.sessions = target.sessions;
	state.currentIndex = 0;
	state.selectedIndex = 0;
	state.streamingSessionId = undefined;
	state.streamingText = "";
	state.activityText = undefined;
	state.scrollOffset = 0;
	state.hasOpenedConversation = false;
	state.newConversationProject = undefined;
	state.newConversationWorkspace = undefined;
	state.projectSelectionMode = undefined;
	state.notice = undefined;
	setBuffer(state, "");
	state.view = "sessions";
	render(state);
}

function openAgentSelect(state: TuiState): void {
	state.view = "agent-select";
	state.agentIndex = 0;
	setBuffer(state, "");
}

function handleAgentSelectKeys(state: TuiState, key: Key): void {
	if (key.name === "up") {
		state.agentIndex = Math.max(0, state.agentIndex - 1);
	} else if (key.name === "down") {
		state.agentIndex = Math.min(AGENT_CHOICES.length - 1, state.agentIndex + 1);
	} else if (isComposerSubmitKey(key)) {
		const choice = AGENT_CHOICES[state.agentIndex];
		if (choice) {
			state.view = "creating-session";
			startSpinner(state);
			render(state);
			defer(state, () => createSession(state, choice.alias));
		}
	} else if (key.name === "escape") {
		state.view =
			state.projectSelectionMode === undefined
				? "sessions"
				: selectedProjectWorkspaces(state).length > 1
					? "workspace-select"
					: "project-select";
	}
}

export function handleSessionsKeys(
	state: TuiState,
	character: string | undefined,
	key: Key,
): void {
	if (key.ctrl && key.name === "p") {
		openProjectSelect(state, "switch");
		return;
	}
	const filter = state.buffer.toLowerCase();
	const sessionMatches = state.sessions
		.map((session, index) => ({ kind: "session" as const, session, index }))
		.filter(({ session }) =>
			`${session.title} ${session.sessionId} ${session.agent}`
				.toLowerCase()
				.includes(filter),
		);
	const matches = [
		...(filter ? [] : [{ kind: "new" as const }]),
		...sessionMatches,
	];

	if (key.name === "up") {
		state.selectedIndex = Math.max(0, state.selectedIndex - 1);
	} else if (key.name === "down") {
		state.selectedIndex = Math.min(
			Math.max(0, matches.length - 1),
			state.selectedIndex + 1,
		);
	} else if (isComposerSubmitKey(key)) {
		const selected = matches[state.selectedIndex];
		if (selected?.kind === "new") {
			state.projectSelectionMode = undefined;
			state.newConversationProject = state.catalog.projects.find(
				(project) => project.id === state.workspace.projectId,
			);
			state.newConversationWorkspace = state.workspace;
			openAgentSelect(state);
		} else if (selected?.kind === "session") {
			defer(state, () => switchTo(state, selected.index));
		}
	} else if (key.name === "escape") {
		setBuffer(state, "");
		if (state.hasOpenedConversation) {
			state.view = "conversation";
		} else {
			state.requestExit?.();
		}
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

function flattenSelectOptions(
	options: readonly (
		| { value: string; name: string; description?: string | null }
		| {
				group: string;
				name: string;
				options: Array<{
					value: string;
					name: string;
					description?: string | null;
				}>;
		  }
	)[],
): { value: string; name: string; description?: string | null }[] {
	return options.flatMap((option) =>
		"options" in option ? option.options : [option],
	);
}

async function openModelSelect(state: TuiState): Promise<void> {
	const session = current(state);
	if (!session) return;
	try {
		const snapshot = await state.connection.client.acpSessions.get.query({
			sessionId: session.sessionId,
		});
		const model = snapshot.configOptions.find(
			(option) => option.id === "model" && option.type === "select",
		);
		if (!model || model.type !== "select") {
			state.notice = {
				text:
					snapshot.status === "offline"
						? "此对话已离线；发送消息恢复后即可切换模型"
						: "当前 Agent 不支持切换模型",
				tone: "warning",
			};
			return;
		}
		state.modelOptions = flattenSelectOptions(model.options);
		state.modelIndex = Math.max(
			0,
			state.modelOptions.findIndex(
				(option) => option.value === model.currentValue,
			),
		);
		state.view = "model-select";
	} catch (error) {
		reportError(state, error);
	}
}

function handleModelSelectKeys(state: TuiState, key: Key): void {
	if (key.name === "up") {
		state.modelIndex = Math.max(0, state.modelIndex - 1);
	} else if (key.name === "down") {
		state.modelIndex = Math.min(
			state.modelOptions.length - 1,
			state.modelIndex + 1,
		);
	} else if (isComposerSubmitKey(key)) {
		const session = current(state);
		const option = state.modelOptions[state.modelIndex];
		if (!session || !option) return;
		defer(state, async () => {
			try {
				const controller = await attachSessionController(state, session);
				await controller.actions.setConfigOption("model", option.value);
				state.view = "conversation";
				state.notice = { text: `模型已切换为 ${option.name}`, tone: "success" };
			} catch (error) {
				reportError(state, error);
			}
			render(state);
		});
	} else if (key.name === "escape") {
		state.view = "conversation";
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
	} else if (isComposerSubmitKey(key)) {
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
	defer(state, () => switchTo(state, next));
}

export function isRunningSessionStatus(status: string): boolean {
	return status === "running" || status === "starting";
}

async function switchTo(state: TuiState, index: number): Promise<void> {
	const target = state.sessions[index];
	if (
		state.attachedSessionId &&
		state.attachedSessionId !== target?.sessionId
	) {
		state.controller?.stop();
		state.controller = undefined;
		state.attachedSessionId = undefined;
	}
	if (index !== state.currentIndex) {
		state.currentIndex = index;
	}
	state.scrollOffset = 0;
	setBuffer(state, "");
	state.view = "conversation";
	state.hasOpenedConversation = true;
	const session = current(state);
	state.notice = undefined;
	// Idle sessions can start running from Desktop or another CLI. Subscribe
	// immediately, and let the shared controller own history as well as updates.
	if (session) await attachSessionController(state, session);
	render(state);
}

/**
 * Schedule async work started from a keypress off the readline emit call.
 *
 * Bun's readline emits keypress events synchronously while holding the
 * stream; awaits started directly in the handler can stall behind that
 * internal state. A macrotask boundary lets the async chain run on the
 * normal event loop.
 */
export function defer(state: TuiState, work: () => Promise<void>): void {
	setTimeout(() => {
		if (!state.active) return;
		void Promise.resolve()
			.then(work)
			.catch((error: unknown) => {
				reportError(state, error);
				render(state);
			});
	}, 0);
}

function submit(state: TuiState): void {
	const input = state.buffer.trim();
	setBuffer(state, "");
	if (!input) return;
	state.scrollOffset = 0;
	state.inputHistory.push(input);
	state.historyIndex = state.inputHistory.length;
	if (input.startsWith("/")) {
		// Async commands (sessions refresh, /new) must repaint once their
		// awaits resolve — the keypress-driven render runs too early.
		defer(state, async () => {
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
	defer(state, () => sendMessage(state, input));
}

export async function handleCommand(
	state: TuiState,
	input: string,
): Promise<void> {
	const [name, ...parts] = input.slice(1).trim().split(/\s+/);
	const argument = parts.join(" ");
	switch (name) {
		case "projects":
			openProjectSelect(state, "switch");
			break;
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
		case "model":
			await openModelSelect(state);
			break;
		case "history": {
			const session = current(state);
			if (session) {
				const controller = await attachSessionController(state, session);
				await controller.loadOlder();
				const snapshot = controller.getSnapshot();
				if (snapshot.historyError) throw snapshot.historyError;
				state.scrollOffset = 0;
				state.notice = { text: "已加载历史", tone: "success" };
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
				"- `Shift+Enter` 或 `Alt+Enter` 换行；支持多行粘贴",
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
			state.requestExit?.();
			break;
		default:
			state.notice = { text: `未知命令：/${name}`, tone: "warning" };
	}
}

async function createSession(state: TuiState, argument: string): Promise<void> {
	const alias = argument.trim().toLowerCase();
	const targetWorkspace = state.newConversationWorkspace ?? state.workspace;
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
			workspaceId: targetWorkspace.id,
			harness: alias
				? (HARNESS_ALIASES[alias] as "claude-agent-acp")
				: undefined,
		});
		state.newConversationProject = undefined;
		state.newConversationWorkspace = undefined;
		stopSpinner(state);
		if (targetWorkspace.id === state.workspace.id) {
			state.sessions.unshift({
				sessionId: session.sessionId,
				title: session.title ?? "(untitled)",
				agent: agentShortName(session.harness),
				status: session.status,
				messages: [],
				pendingPermissions: [],
				queuedPrompts: [],
				lastSeq: session.lastSeq,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				epoch: session.epoch,
			});
			state.currentIndex = 0;
			state.view = "conversation";
			state.hasOpenedConversation = true;
			state.notice = { text: "新对话已创建", tone: "success" };
		} else {
			state.workspace = targetWorkspace;
			state.sessions = [];
			state.currentIndex = 0;
			await refreshSessions(state);
			const index = state.sessions.findIndex(
				(entry) => entry.sessionId === session.sessionId,
			);
			if (index >= 0) state.currentIndex = index;
			state.view = "conversation";
			state.hasOpenedConversation = true;
			state.notice = {
				text: `已切换到 ${targetWorkspace.name}`,
				tone: "success",
			};
		}
		render(state);
	} catch (error) {
		stopSpinner(state);
		state.view = "agent-select";
		reportError(state, error);
		render(state);
	}
}

function timelineMessages(timeline: FoldedTimeline): ChatMessage[] {
	return timeline.items.flatMap((item) => {
		if (item.kind !== "message" || item.role === "thought") return [];
		const text = item.blocks.map(contentBlockToText).join("");
		return text ? [{ role: item.role, text }] : [];
	});
}

export function splitStreamingAgentMessage(
	messages: readonly ChatMessage[],
	isRunning: boolean,
): { committed: ChatMessage[]; streamingText: string } {
	const latest = messages.at(-1);
	if (!isRunning || latest?.role !== "agent") {
		return { committed: [...messages], streamingText: "" };
	}
	return {
		committed: messages.slice(0, -1),
		streamingText: latest.text,
	};
}

export function syncFromController(
	state: TuiState,
	attachedSession: ChatSession,
	controller: Pick<AcpSessionController, "getSnapshot">,
): void {
	// List refreshes replace row objects. Resolve by identity on every event,
	// and never let a late callback from a switched-away session paint this view.
	const session = current(state);
	if (
		!session ||
		session.sessionId !== attachedSession.sessionId ||
		state.attachedSessionId !== attachedSession.sessionId
	)
		return;
	const snapshot = controller.getSnapshot();
	if (snapshot.error) {
		reportError(state, snapshot.error);
		render(state);
	}
	if (
		snapshot.isLoading &&
		snapshot.timeline.items.length === 0 &&
		session.messages.length > 0
	) {
		return;
	}
	const authoritative = snapshot.state;
	const isRunning = isRunningSessionStatus(
		authoritative?.status ?? session.status,
	);
	const projected = splitStreamingAgentMessage(
		timelineMessages(snapshot.timeline),
		isRunning,
	);
	session.messages = projected.committed;
	if (authoritative) {
		session.status = authoritative.status;
		session.title = authoritative.title ?? session.title;
		session.lastSeq = authoritative.lastSeq;
		session.epoch = authoritative.epoch;
		session.updatedAt = authoritative.updatedAt;
		session.pendingPermissions = authoritative.pendingPermissions;
		session.queuedPrompts = authoritative.queuedPrompts.map((entry) => ({
			queueId: entry.queueId,
			text: entry.prompt.map(contentBlockToText).join(""),
		}));
	}
	state.streamingSessionId = isRunning ? session.sessionId : undefined;
	state.streamingText = projected.streamingText;
	state.activityText = isRunningSessionStatus(session.status)
		? state.streamingText
			? `${session.agent} 正在组织回复`
			: `${session.agent} 正在思考`
		: undefined;
	if (isRunningSessionStatus(session.status)) startSpinner(state);
	else stopSpinner(state);
	render(state);
}

export async function attachSessionController(
	state: TuiState,
	session: ChatSession,
): Promise<AcpSessionController> {
	if (state.attachedSessionId === session.sessionId && state.controller) {
		const controller = state.controller;
		// Exhausted bootstrap/reset retries leave no stream subscription. A
		// successful HTTP prompt alone would otherwise look like a silent hang.
		if (controller.getSnapshot().availability === "unavailable") {
			await controller.refresh();
		}
		const snapshot = controller.getSnapshot();
		if (snapshot.error) throw snapshot.error;
		return controller;
	}
	state.controller?.stop();
	const controller = new AcpSessionController({
		sessionId: session.sessionId,
		api: createAcpSessionsApi(state.connection),
		streamUrl: sessionStreamUrl(state.connection, session.sessionId),
	});
	state.controller = controller;
	state.attachedSessionId = session.sessionId;
	controller.subscribe(() => syncFromController(state, session, controller));
	await controller.start();
	const snapshot = controller.getSnapshot();
	if (snapshot.error) throw snapshot.error;
	return controller;
}

async function cancelTurn(
	state: TuiState,
	session: ChatSession,
): Promise<void> {
	if (session.status !== "running") return;
	try {
		const controller = await attachSessionController(state, session);
		await controller.actions.cancel();
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
		const controller = await attachSessionController(state, session);
		await controller.actions.respondToPermission(
			request.requestId,
			makeSelectedOutcome([option.optionId]),
		);
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
	if (isRunningSessionStatus(session.status)) {
		try {
			const controller = await attachSessionController(state, session);
			await controller.actions.enqueue([{ type: "text", text }]);
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
	state.notice = { text: "正在提交消息…", tone: "info" };
	render(state);
	try {
		const controller = await attachSessionController(state, session);
		await controller.actions.prompt([{ type: "text", text }]);
		state.notice = undefined;
	} catch (error) {
		reportError(state, error);
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
