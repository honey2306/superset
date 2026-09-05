/**
 * Helpers shared by the `superset sessions` subcommands.
 */

import type { SessionScopedState } from "@superset/session-protocol";
import type { CommandContext } from "../../lib/context";
import { notFoundError, usageError } from "../../lib/exit-codes";
import type { HostConnection } from "../../lib/host-connection";
import {
	darkMarkdownTheme,
	type MarkdownTheme,
	noColorMarkdownTheme,
} from "../../lib/markdown";

/** Options across all session subcommands that consume the next argument. */
export const SESSION_VALUE_OPTIONS = [
	"workspace",
	"limit",
	"cursor",
	"harness",
	"agent",
	"model",
	"timeout",
	"turn",
	"message",
	"request",
	"option",
	"remove",
] as const;

/**
 * Resolve a session from an id prefix or a unique title substring, so callers
 * never have to paste a full uuid.
 */
export async function resolveSession(
	connection: HostConnection,
	reference: string,
): Promise<SessionScopedState> {
	const page = await connection.client.acpSessions.list.query({ limit: 200 });
	const sessions = page.items;

	const byId = sessions.filter((session) =>
		session.sessionId.startsWith(reference),
	);
	if (byId.length === 1 && byId[0]) return byId[0];
	if (byId.length > 1) {
		throw usageError(
			`Session id prefix "${reference}" is ambiguous.`,
			...byId.slice(0, 5).map((s) => `  ${s.sessionId}  ${s.title ?? ""}`),
		);
	}

	const lowered = reference.toLowerCase();
	const byTitle = sessions.filter((session) =>
		(session.title ?? "").toLowerCase().includes(lowered),
	);
	if (byTitle.length === 1 && byTitle[0]) return byTitle[0];
	if (byTitle.length > 1) {
		throw usageError(
			`Session "${reference}" matches multiple conversations.`,
			...byTitle.slice(0, 5).map((s) => `  ${s.sessionId}  ${s.title ?? ""}`),
		);
	}

	throw notFoundError(`No session matches "${reference}".`);
}

export function serializeSession(
	session: SessionScopedState,
	workspaceName?: string,
): Record<string, unknown> {
	return {
		sessionId: session.sessionId,
		title: session.title,
		status: session.status,
		harness: session.harness,
		workspaceId: session.workspaceId,
		workspace: workspaceName,
		cwd: session.cwd,
		lastStopReason: session.lastStopReason,
		lastError: session.lastError,
		pendingPermissions: session.pendingPermissions.length,
		queuedPrompts: session.queuedPrompts.length,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
	};
}

export function statusLabel(ctx: CommandContext, status: string): string {
	switch (status) {
		case "idle":
			return ctx.out.green("idle");
		case "running":
			return ctx.out.cyan("running");
		case "awaiting_permission":
			return ctx.out.yellow("permission");
		case "offline":
			return ctx.out.gray("offline");
		case "dead":
			return ctx.out.red("dead");
		default:
			return ctx.out.dim(status);
	}
}

/** Terminal width for rendering, clamped so output stays readable. */
export function renderWidth(): number {
	const columns = process.stdout.columns ?? 80;
	return Math.max(40, Math.min(columns, 100));
}

/** The Markdown theme matching the caller's color preference. */
export function markdownThemeFor(color: boolean): MarkdownTheme {
	return color ? darkMarkdownTheme : noColorMarkdownTheme;
}
