/**
 * `superset sessions queue` and `cancel` — manage work waiting on a session.
 *
 * Prompts sent while a turn is running are queued by the host and drained when
 * it finishes. Being able to inspect and clear that queue matters for
 * automation: a script that queued the wrong follow-up needs a way out that
 * does not involve killing the conversation.
 */

import { getFlag, getOption } from "../../lib/args";
import { contentBlocksToText } from "../../lib/content";
import type { CommandContext } from "../../lib/context";
import { notFoundError, usageError } from "../../lib/exit-codes";
import { truncateVisible } from "../../lib/output";
import { formatDuration } from "../status";
import { resolveSession } from "./shared";

export async function sessionsQueueCommand(ctx: CommandContext): Promise<void> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError(
			"Usage: superset sessions queue <session> [--remove <queueId>] [--clear]",
		);
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);

	const removeId = getOption(ctx.args, "remove");
	const clear = getFlag(ctx.args, "clear");
	if (removeId && clear) {
		throw usageError("--remove and --clear are mutually exclusive.");
	}

	if (clear) {
		await connection.client.acpSessions.clearQueue.mutate({
			sessionId: session.sessionId,
		});
		if (ctx.out.isMachineReadable) {
			ctx.out.json({ sessionId: session.sessionId, cleared: true });
			return;
		}
		ctx.out.result(
			`${ctx.out.green("✓")} Cleared ${session.queuedPrompts.length} queued prompt${
				session.queuedPrompts.length === 1 ? "" : "s"
			}`,
		);
		return;
	}

	if (removeId) {
		const queued = session.queuedPrompts.find(
			(entry) => entry.queueId === removeId,
		);
		if (!queued) {
			throw notFoundError(`No queued prompt matches "${removeId}".`);
		}
		await connection.client.acpSessions.removeQueuedPrompt.mutate({
			sessionId: session.sessionId,
			queueId: removeId,
		});
		if (ctx.out.isMachineReadable) {
			ctx.out.json({ sessionId: session.sessionId, removed: removeId });
			return;
		}
		ctx.out.result(`${ctx.out.green("✓")} Removed queued prompt ${removeId}`);
		return;
	}

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			sessionId: session.sessionId,
			status: session.status,
			queued: session.queuedPrompts.map((entry) => ({
				queueId: entry.queueId,
				text: contentBlocksToText(entry.prompt),
				enqueuedAt: entry.enqueuedAt,
			})),
		});
		return;
	}

	if (session.queuedPrompts.length === 0) {
		ctx.out.line(ctx.out.dim("Nothing queued."));
		return;
	}

	ctx.out.line();
	ctx.out.table(
		session.queuedPrompts.map((entry, index) => [
			ctx.out.dim(String(index + 1)),
			entry.queueId.slice(0, 8),
			truncateVisible(
				contentBlocksToText(entry.prompt).replace(/\s+/g, " "),
				52,
			),
			ctx.out.dim(`${formatDuration(Date.now() - entry.enqueuedAt)} ago`),
		]),
	);
	ctx.out.line();
}

export async function sessionsCancelCommand(
	ctx: CommandContext,
): Promise<void> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError("Usage: superset sessions cancel <session>");
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);

	if (session.status !== "running") {
		if (ctx.out.isMachineReadable) {
			ctx.out.json({
				sessionId: session.sessionId,
				cancelled: false,
				status: session.status,
			});
			return;
		}
		ctx.out.result(
			ctx.out.dim(`Nothing to cancel; the session is ${session.status}.`),
		);
		return;
	}

	await connection.client.acpSessions.cancel.mutate({
		sessionId: session.sessionId,
	});

	if (ctx.out.isMachineReadable) {
		ctx.out.json({ sessionId: session.sessionId, cancelled: true });
		return;
	}
	ctx.out.result(
		`${ctx.out.green("✓")} Requested cancellation of the current turn`,
	);
}
