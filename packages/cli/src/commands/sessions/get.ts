/**
 * `superset sessions get` — one conversation's current state.
 */

import type { CommandContext } from "../../lib/context";
import { usageError } from "../../lib/exit-codes";
import { loadCatalog } from "../../lib/resolve";
import { formatDuration } from "../status";
import { resolveSession, serializeSession, statusLabel } from "./shared";

export async function sessionsGetCommand(ctx: CommandContext): Promise<void> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError("Usage: superset sessions get <session>");
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);
	const catalog = await loadCatalog(connection);
	const workspace = catalog.workspaces.find(
		(entry) => entry.id === session.workspaceId,
	);

	if (ctx.out.isMachineReadable) {
		ctx.out.json(serializeSession(session, workspace?.name));
		return;
	}

	ctx.out.line();
	ctx.out.line(ctx.out.bold(session.title ?? "(untitled)"));
	ctx.out.line();
	ctx.out.table([
		[ctx.out.dim("id"), session.sessionId],
		[ctx.out.dim("status"), statusLabel(ctx, session.status)],
		[ctx.out.dim("agent"), session.harness],
		[ctx.out.dim("workspace"), workspace?.name ?? session.workspaceId],
		[ctx.out.dim("cwd"), session.cwd],
		[
			ctx.out.dim("updated"),
			`${formatDuration(Date.now() - session.updatedAt)} ago`,
		],
		...(session.lastStopReason
			? [[ctx.out.dim("stop reason"), session.lastStopReason]]
			: []),
		...(session.lastError
			? [[ctx.out.dim("last error"), ctx.out.red(session.lastError)]]
			: []),
		...(session.queuedPrompts.length > 0
			? [[ctx.out.dim("queued"), String(session.queuedPrompts.length)]]
			: []),
		...(session.pendingPermissions.length > 0
			? [
					[
						ctx.out.dim("permission"),
						ctx.out.yellow(`${session.pendingPermissions.length} pending`),
					],
				]
			: []),
	]);
	ctx.out.line();
}
