/**
 * `superset sessions list` — the conversations available on this machine.
 */

import { getNumberOption, getOption } from "../../lib/args";
import type { CommandContext } from "../../lib/context";
import { truncateVisible } from "../../lib/output";
import {
	loadCatalog,
	resolveWorkspace,
	type WorkspaceRef,
} from "../../lib/resolve";
import { serializeSession, statusLabel } from "./shared";

export async function sessionsListCommand(ctx: CommandContext): Promise<void> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);
	const workspaceNames = new Map(
		catalog.workspaces.map((workspace) => [workspace.id, workspace.name]),
	);

	const workspaceRef = getOption(ctx.args, "workspace", "w");
	let workspaceFilter: WorkspaceRef | undefined;
	if (workspaceRef) {
		workspaceFilter = resolveWorkspace(
			catalog.workspaces,
			workspaceRef,
			process.cwd(),
		);
	}

	const page = await connection.client.acpSessions.list.query({
		limit: getNumberOption(ctx.args, "limit") ?? 50,
		workspaceId: workspaceFilter?.id,
		cursor: getOption(ctx.args, "cursor"),
	});

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			sessions: page.items.map((session) =>
				serializeSession(session, workspaceNames.get(session.workspaceId)),
			),
			nextCursor: page.nextCursor,
			enabled: page.enabled,
		});
		return;
	}

	if (page.items.length === 0) {
		ctx.out.line(ctx.out.dim("No conversations yet."));
		return;
	}

	ctx.out.line();
	ctx.out.table(
		page.items.map((session, index) => [
			ctx.out.dim(String(index + 1)),
			session.sessionId.slice(0, 8),
			truncateVisible(session.title ?? ctx.out.dim("(untitled)"), 40),
			ctx.out.dim(workspaceNames.get(session.workspaceId) ?? "—"),
			statusLabel(ctx, session.status),
		]),
	);
	ctx.out.line();
	if (page.nextCursor) {
		ctx.out.line(ctx.out.dim(`More available: --cursor ${page.nextCursor}`));
	}
}
