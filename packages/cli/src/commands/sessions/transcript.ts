/**
 * `superset sessions transcript` — read a conversation's history.
 *
 * Reads semantic turns rather than raw journal frames: one turn can contain
 * hundreds of envelopes, and turns survive journal eviction because the host
 * persists them.
 */

import type { TranscriptTurn } from "@superset/session-protocol";
import { getNumberOption, getOption } from "../../lib/args";
import { contentBlocksToText } from "../../lib/content";
import type { CommandContext } from "../../lib/context";
import { usageError } from "../../lib/exit-codes";
import { renderMarkdown } from "../../lib/markdown";
import { markdownThemeFor, renderWidth, resolveSession } from "./shared";

export async function sessionsTranscriptCommand(
	ctx: CommandContext,
): Promise<void> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError(
			"Usage: superset sessions transcript <session> [--limit n] [--turn n]",
		);
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);

	const page = await connection.client.acpSessions.getTranscript.query({
		sessionId: session.sessionId,
		limit: getNumberOption(ctx.args, "limit") ?? 8,
		cursor: getOption(ctx.args, "cursor"),
		targetTurn: getNumberOption(ctx.args, "turn"),
	});

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			sessionId: session.sessionId,
			title: session.title,
			totalTurns: page.totalTurns,
			nextCursor: page.nextCursor,
			turns: page.turns.map((turn) => ({
				turnNumber: turn.turnNumber,
				status: turn.status,
				isComplete: turn.isComplete,
				startedAt: turn.startedAt,
				completedAt: turn.completedAt,
				durationMs: turn.durationMs,
				toolCallCount: turn.toolCallCount,
				user: turnUserText(turn),
				agent: turnAgentText(turn),
				tools: turn.toolSummaries?.map((tool) => ({
					name: tool.name,
					title: tool.title,
					status: tool.status,
				})),
			})),
		});
		return;
	}

	if (page.turns.length === 0) {
		ctx.out.line(ctx.out.dim("No conversation history yet."));
		return;
	}

	const width = renderWidth();
	ctx.out.line();
	for (const turn of page.turns) {
		renderTurn(ctx, turn, width);
	}

	const shown = page.turns.length;
	ctx.out.line(
		ctx.out.dim(
			`${shown} of ${page.totalTurns} turn${page.totalTurns === 1 ? "" : "s"}` +
				(page.nextCursor ? ` · older: --cursor ${page.nextCursor}` : ""),
		),
	);
	ctx.out.line();
}

function turnUserText(turn: TranscriptTurn): string {
	const full = contentBlocksToText(turn.userMessage);
	return full || turn.userPreview;
}

function turnAgentText(turn: TranscriptTurn): string {
	const full = contentBlocksToText(turn.assistantMessage);
	return full || turn.agentPreview || "";
}

function renderTurn(
	ctx: CommandContext,
	turn: TranscriptTurn,
	width: number,
): void {
	const userText = turnUserText(turn);
	if (userText) {
		ctx.out.line(`${ctx.out.bold(ctx.out.cyan("❯"))} ${userText}`);
		ctx.out.line();
	}

	const toolCount = turn.toolCallCount ?? turn.toolSummaries?.length ?? 0;
	if (toolCount > 0) {
		const failed =
			turn.toolSummaries?.filter((tool) => tool.status === "failed").length ??
			0;
		const detail = failed > 0 ? `, ${failed} failed` : "";
		ctx.out.line(
			ctx.out.dim(
				`  ⚙ ${toolCount} tool call${toolCount === 1 ? "" : "s"}${detail}`,
			),
		);
		ctx.out.line();
	}

	const agentText = turnAgentText(turn);
	if (agentText) {
		for (const line of renderMarkdown(agentText, width, {
			theme: markdownThemeFor(ctx.out.options.color),
		})) {
			ctx.out.line(line);
		}
		ctx.out.line();
	}

	if (turn.status === "failed") {
		ctx.out.line(ctx.out.red("  turn failed"));
		ctx.out.line();
	} else if (turn.status === "cancelled") {
		ctx.out.line(ctx.out.yellow("  turn cancelled"));
		ctx.out.line();
	} else if (!turn.isComplete) {
		ctx.out.line(ctx.out.dim("  turn still in progress"));
		ctx.out.line();
	}
}
