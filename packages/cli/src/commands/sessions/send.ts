/**
 * `superset sessions send` — continue an existing conversation.
 *
 * `prompt` only acknowledges receipt; a turn can outlive any HTTP request (it
 * may block on a human permission decision). Completion is therefore observed
 * on the WebSocket journal, never by waiting on the mutation.
 */

import type {
	ContentBlock,
	FoldedTimeline,
	SessionScopedState,
} from "@superset/session-protocol";
import { AcpSessionController } from "@superset/session-protocol/controller";
import { getFlag, getOption, parseDuration } from "../../lib/args";
import { contentBlockToText } from "../../lib/content";
import type { CommandContext } from "../../lib/context";
import {
	conflictError,
	EXIT_CODES,
	timeoutError,
	usageError,
} from "../../lib/exit-codes";
import {
	createAcpSessionsApi,
	type HostConnection,
	sessionStreamUrl,
} from "../../lib/host-connection";
import { renderMarkdown } from "../../lib/markdown";
import { markdownThemeFor, renderWidth, resolveSession } from "./shared";

/** How the prompt should be delivered relative to a turn already running. */
type SendMode = "auto" | "queue" | "now";

export async function sessionsSendCommand(
	ctx: CommandContext,
): Promise<number> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError(
			"Usage: superset sessions send <session> [message] [--follow] [--now]",
			"The message may also be piped on stdin.",
		);
	}

	const text = await readPromptText(ctx);
	if (!text.trim()) {
		throw usageError(
			"Refusing to send an empty message.",
			"Pass the text as an argument, or pipe it on stdin.",
		);
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);

	if (session.status === "dead") {
		throw conflictError(
			`Session ${session.sessionId.slice(0, 8)} cannot be resumed.`,
			"The host has marked it dead for this lifetime; create a new conversation.",
		);
	}
	if (session.status === "awaiting_permission") {
		throw conflictError(
			"This conversation is waiting on a permission decision.",
			`Resolve it first: superset sessions permissions ${session.sessionId.slice(0, 8)}`,
		);
	}

	const mode = resolveSendMode(ctx);
	const follow = getFlag(ctx.args, "follow");
	const wait = getFlag(ctx.args, "wait") || follow;
	const timeoutRaw = getOption(ctx.args, "timeout");
	const timeoutMs = timeoutRaw ? parseDuration(timeoutRaw) : undefined;

	const prompt: ContentBlock[] = [{ type: "text", text }];
	const commandId = crypto.randomUUID();

	// Attach before sending: a short turn can finish before a later subscribe
	// would attach, and the journal cursor is what makes this race-free.
	const controller = new AbortController();
	const watcher = wait
		? await startTurnWatcher(ctx, connection, session, controller.signal)
		: undefined;

	const delivery = await deliverPrompt(connection, session, {
		mode,
		prompt,
		commandId,
	});

	if (!wait) {
		reportAccepted(ctx, session, delivery);
		return EXIT_CODES.OK;
	}

	const timer = timeoutMs
		? setTimeout(() => controller.abort(), timeoutMs)
		: undefined;

	try {
		const outcome = await watcher?.outcome;
		if (!outcome) return EXIT_CODES.OK;

		if (outcome.kind === "timeout") {
			throw timeoutError(
				`Timed out after ${timeoutRaw} waiting for the turn to finish.`,
				`Session: ${session.sessionId}`,
			);
		}
		if (outcome.kind === "permission") {
			ctx.out.line();
			ctx.out.line(ctx.out.yellow(`Permission required: ${outcome.title}`));
			ctx.out.line(
				ctx.out.dim(
					`Resolve with: superset sessions permissions ${session.sessionId.slice(0, 8)}`,
				),
			);
			return EXIT_CODES.CONFLICT;
		}
		if (outcome.kind === "rejected") {
			ctx.out.error(`The prompt was rejected: ${outcome.reason}`);
			return EXIT_CODES.FAILURE;
		}
		if (outcome.kind === "reset") {
			ctx.out.warn(
				`Live stream reset (${outcome.reason}); the turn may still be running.`,
			);
			return EXIT_CODES.OK;
		}

		if (ctx.out.isMachineReadable) {
			ctx.out.json({
				sessionId: session.sessionId,
				accepted: true,
				mode: delivery,
				status: outcome.status,
				stopReason: outcome.stopReason,
				text: outcome.text,
			});
		}
		return outcome.status === "dead" ? EXIT_CODES.FAILURE : EXIT_CODES.OK;
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}

function resolveSendMode(ctx: CommandContext): SendMode {
	const now = getFlag(ctx.args, "now");
	const queue = getFlag(ctx.args, "queue");
	if (now && queue) {
		throw usageError("--now and --queue are mutually exclusive.");
	}
	if (now) return "now";
	if (queue) return "queue";
	return "auto";
}

/**
 * Read the message from the positional argument, or from stdin when piped.
 * Piped input is preferred for long prompts that would be awkward to quote.
 */
async function readPromptText(ctx: CommandContext): Promise<string> {
	const inline = ctx.args.positionals.slice(3).join(" ");
	const wantsStdin = getFlag(ctx.args, "stdin");
	if (inline && !wantsStdin) return inline;

	const isPiped = process.stdin.isTTY !== true;
	if (wantsStdin || (!inline && isPiped)) {
		const piped = await Bun.stdin.text();
		if (piped.trim()) return piped;
	}
	return inline;
}

type DeliveryMode = "prompt" | "enqueued" | "sent-now";

async function deliverPrompt(
	connection: HostConnection,
	session: SessionScopedState,
	options: { mode: SendMode; prompt: ContentBlock[]; commandId: string },
): Promise<DeliveryMode> {
	const { mode, prompt, commandId } = options;
	const input = { sessionId: session.sessionId, prompt, commandId };

	if (mode === "now") {
		await connection.client.acpSessions.sendNow.mutate(input);
		return "sent-now";
	}
	if (mode === "queue") {
		await connection.client.acpSessions.enqueuePrompt.mutate(input);
		return "enqueued";
	}
	// `auto`: queue behind a turn in flight, otherwise start one.
	if (session.status === "running") {
		await connection.client.acpSessions.enqueuePrompt.mutate(input);
		return "enqueued";
	}
	await connection.client.acpSessions.prompt.mutate(input);
	return "prompt";
}

function reportAccepted(
	ctx: CommandContext,
	session: SessionScopedState,
	delivery: DeliveryMode,
): void {
	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			sessionId: session.sessionId,
			accepted: true,
			mode: delivery,
		});
		return;
	}
	const suffix =
		delivery === "enqueued"
			? " (queued behind the current turn)"
			: delivery === "sent-now"
				? " (interrupted the current turn)"
				: "";
	ctx.out.result(
		`${ctx.out.green("✓")} Sent to ${session.sessionId.slice(0, 8)}${suffix}`,
	);
}

type TurnOutcome =
	| {
			kind: "finished";
			status: string;
			stopReason: string | null;
			text: string;
	  }
	| { kind: "permission"; title: string }
	| { kind: "rejected"; reason: string }
	| { kind: "reset"; reason: string }
	| { kind: "timeout" };

/**
 * Follow the journal until the turn we just started reaches a terminal state.
 *
 * Streams agent text as it arrives when `--follow` is set; otherwise stays
 * silent and only reports the outcome.
 */
function agentText(timeline: FoldedTimeline): string {
	return timeline.items
		.filter((item) => item.kind === "message" && item.role === "agent")
		.flatMap((item) => (item.kind === "message" ? item.blocks : []))
		.map(contentBlockToText)
		.join("");
}

/** Follow a turn through the same headless ACP controller used by the TUI. */
async function startTurnWatcher(
	ctx: CommandContext,
	connection: HostConnection,
	session: SessionScopedState,
	signal: AbortSignal,
): Promise<{ outcome: Promise<TurnOutcome> }> {
	const follow = getFlag(ctx.args, "follow");
	const controller = new AcpSessionController({
		sessionId: session.sessionId,
		api: createAcpSessionsApi(connection),
		streamUrl: sessionStreamUrl(connection, session.sessionId),
	});
	await controller.start();
	const baselineAgentText = agentText(controller.getSnapshot().timeline);
	let latestText = "";
	let printedChars = 0;
	let sawActivity = false;
	let headerPrinted = false;

	const flushPlain = () => {
		const pending = latestText.slice(printedChars);
		if (!pending) return;
		process.stdout.write(pending);
		printedChars = latestText.length;
	};

	const outcome = new Promise<TurnOutcome>((resolve) => {
		let settled = false;
		const finish = (outcome: TurnOutcome) => {
			if (settled) return;
			settled = true;
			unsubscribe();
			controller.stop();
			resolve(outcome);
		};
		const unsubscribe = controller.subscribe(() => {
			const snapshot = controller.getSnapshot();
			const allAgentText = agentText(snapshot.timeline);
			latestText = allAgentText.slice(baselineAgentText.length);
			const status = snapshot.state?.status;
			if (status === "running" || status === "starting") sawActivity = true;
			if (latestText) {
				sawActivity = true;
				if (follow && !headerPrinted && !ctx.out.isMachineReadable) {
					ctx.out.line();
					headerPrinted = true;
				}
				if (follow && !ctx.out.isMachineReadable) flushPlain();
			}
			const permission = snapshot.state?.pendingPermissions[0];
			if (permission) {
				finish({
					kind: "permission",
					title: permission.toolCall.title ?? "(untitled request)",
				});
				return;
			}
			if (snapshot.timeline.resetReason) {
				finish({ kind: "reset", reason: snapshot.timeline.resetReason });
				return;
			}
			if (sawActivity && (status === "idle" || status === "dead")) {
				finish({
					kind: "finished",
					status,
					stopReason: snapshot.state?.lastStopReason ?? null,
					text: latestText,
				});
			}
		});
		signal.addEventListener("abort", () => finish({ kind: "timeout" }), {
			once: true,
		});
	}).then((outcome) => {
		if (follow && !ctx.out.isMachineReadable) {
			flushPlain();
			if (latestText) process.stdout.write("\n");
		}
		if (
			outcome.kind === "finished" &&
			follow &&
			!ctx.out.isMachineReadable &&
			outcome.text.trim()
		) {
			process.stdout.write("\x1b[2K\r");
			ctx.out.line();
			for (const line of renderMarkdown(outcome.text, renderWidth(), {
				theme: markdownThemeFor(ctx.out.options.color),
			})) {
				ctx.out.line(line);
			}
			ctx.out.line();
		}
		if (outcome.kind === "finished" && !follow && !ctx.out.isMachineReadable) {
			ctx.out.result(
				`${ctx.out.green("✓")} Turn finished (${outcome.stopReason ?? outcome.status})`,
			);
		}
		return outcome;
	});
	return { outcome };
}
