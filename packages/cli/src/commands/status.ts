/**
 * `superset status` — is the local runtime up, and what does it hold?
 */

import { LOCAL_HOST_SCOPE_ID } from "@superset/shared/host-paths";
import type { CommandContext } from "../lib/context";
import { loadCatalog } from "../lib/resolve";

export async function statusCommand(ctx: CommandContext): Promise<void> {
	const connection = await ctx.host();
	const [catalog, sessions] = await Promise.all([
		loadCatalog(connection),
		connection.client.acpSessions.list.query({ limit: 200 }),
	]);

	const byStatus = new Map<string, number>();
	for (const session of sessions.items) {
		byStatus.set(session.status, (byStatus.get(session.status) ?? 0) + 1);
	}

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			ok: true,
			endpoint: connection.endpoint,
			pid: connection.manifest.pid,
			startedAt: connection.manifest.startedAt,
			scopeId: LOCAL_HOST_SCOPE_ID,
			projects: catalog.projects.length,
			workspaces: catalog.workspaces.length,
			sessions: {
				total: sessions.items.length,
				byStatus: Object.fromEntries(byStatus),
				enabled: sessions.enabled,
			},
		});
		return;
	}

	const uptimeMs = Date.now() - connection.manifest.startedAt;
	ctx.out.line(ctx.out.bold("Superset host-service"));
	ctx.out.line();
	ctx.out.table([
		[ctx.out.dim("status"), ctx.out.green("running")],
		[ctx.out.dim("endpoint"), connection.endpoint],
		[ctx.out.dim("pid"), String(connection.manifest.pid)],
		[ctx.out.dim("uptime"), formatDuration(uptimeMs)],
		[ctx.out.dim("projects"), String(catalog.projects.length)],
		[ctx.out.dim("workspaces"), String(catalog.workspaces.length)],
		[
			ctx.out.dim("sessions"),
			summarizeSessions(byStatus, sessions.items.length),
		],
	]);
	ctx.out.line();
}

function summarizeSessions(
	byStatus: ReadonlyMap<string, number>,
	total: number,
): string {
	if (total === 0) return "0";
	const parts = [...byStatus.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([status, count]) => `${count} ${status}`);
	return `${total} (${parts.join(", ")})`;
}

export function formatDuration(milliseconds: number): string {
	if (milliseconds < 0) return "just now";
	const seconds = Math.floor(milliseconds / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}
