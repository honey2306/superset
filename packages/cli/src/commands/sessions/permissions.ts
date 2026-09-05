/**
 * `superset sessions permissions` / `approve` / `deny` — resolve the decisions
 * an agent is blocked on.
 *
 * A turn that requests permission stops until someone answers, so without
 * these commands a CLI-driven conversation can stall indefinitely. Approval is
 * never implicit: the caller must run `approve` (or pass an explicit option).
 */

import type { PendingPermission } from "@superset/session-protocol";
import { makeSelectedOutcome } from "@superset/session-protocol";
import { getOption } from "../../lib/args";
import type { CommandContext } from "../../lib/context";
import { conflictError, notFoundError, usageError } from "../../lib/exit-codes";
import { formatDuration } from "../status";
import { resolveSession } from "./shared";

/** Option kinds, in the order a caller most likely wants them. */
const APPROVE_KINDS = ["allow_once", "allow_always"] as const;
const DENY_KINDS = ["reject_once", "reject_always"] as const;

export async function sessionsPermissionsCommand(
	ctx: CommandContext,
): Promise<void> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError("Usage: superset sessions permissions <session>");
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);
	const pending = session.pendingPermissions;

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			sessionId: session.sessionId,
			status: session.status,
			pending: pending.map(serializePermission),
		});
		return;
	}

	if (pending.length === 0) {
		ctx.out.line(ctx.out.dim("No permission requests pending."));
		return;
	}

	ctx.out.line();
	for (const request of pending) {
		ctx.out.line(
			`${ctx.out.yellow("◆")} ${ctx.out.bold(request.toolCall.title ?? "(untitled request)")}`,
		);
		ctx.out.line(
			ctx.out.dim(
				`  request ${request.requestId} · asked ${formatDuration(Date.now() - request.requestedAt)} ago`,
			),
		);
		ctx.out.line();
		for (const option of request.options) {
			ctx.out.line(
				`    ${option.optionId.padEnd(18)} ${option.name} ${ctx.out.dim(`(${option.kind})`)}`,
			);
		}
		ctx.out.line();
	}

	const short = session.sessionId.slice(0, 8);
	ctx.out.line(
		ctx.out.dim(
			`Approve: superset sessions approve ${short}    Deny: superset sessions deny ${short}`,
		),
	);
	ctx.out.line();
}

export async function sessionsApproveCommand(
	ctx: CommandContext,
): Promise<void> {
	await resolvePermission(ctx, "approve");
}

export async function sessionsDenyCommand(ctx: CommandContext): Promise<void> {
	await resolvePermission(ctx, "deny");
}

async function resolvePermission(
	ctx: CommandContext,
	action: "approve" | "deny",
): Promise<void> {
	const reference = ctx.args.positionals[2];
	if (!reference) {
		throw usageError(
			`Usage: superset sessions ${action} <session> [--request <id>] [--option <id>]`,
		);
	}

	const connection = await ctx.host();
	const session = await resolveSession(connection, reference);
	const pending = session.pendingPermissions;

	if (pending.length === 0) {
		throw notFoundError("This conversation has no pending permission request.");
	}

	const requestId = getOption(ctx.args, "request");
	const request = requestId
		? pending.find((entry) => entry.requestId === requestId)
		: pending[0];
	if (!request) {
		throw notFoundError(`No pending request matches "${requestId}".`);
	}
	// Refuse to guess when several decisions are outstanding: answering the
	// wrong one could authorize something the caller never saw.
	if (!requestId && pending.length > 1) {
		throw conflictError(
			`${pending.length} permission requests are pending; choose one.`,
			...pending.map(
				(entry) =>
					`  --request ${entry.requestId}  ${entry.toolCall.title ?? ""}`,
			),
		);
	}

	const optionId = getOption(ctx.args, "option");
	const option = optionId
		? request.options.find((entry) => entry.optionId === optionId)
		: pickOption(request, action);

	if (!option) {
		throw usageError(
			optionId
				? `Option "${optionId}" is not offered for this request.`
				: `This request offers no ${action === "approve" ? "allow" : "reject"} option.`,
			...request.options.map(
				(entry) =>
					`  --option ${entry.optionId}  ${entry.name} (${entry.kind})`,
			),
		);
	}

	const result = await connection.client.acpSessions.respondToPermission.mutate(
		{
			sessionId: session.sessionId,
			requestId: request.requestId,
			outcome: makeSelectedOutcome([option.optionId]),
		},
	);

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			sessionId: session.sessionId,
			requestId: request.requestId,
			optionId: option.optionId,
			status: result.status,
		});
		return;
	}

	if (result.status === "already_resolved") {
		ctx.out.result(
			ctx.out.dim("That request was already resolved by another client."),
		);
		return;
	}

	const verb = action === "approve" ? "Approved" : "Denied";
	ctx.out.result(
		`${ctx.out.green("✓")} ${verb}: ${option.name} ${ctx.out.dim(`(${option.kind})`)}`,
	);
}

/** The option matching the caller's intent, preferring the "once" variant. */
function pickOption(request: PendingPermission, action: "approve" | "deny") {
	const kinds = action === "approve" ? APPROVE_KINDS : DENY_KINDS;
	for (const kind of kinds) {
		const match = request.options.find((option) => option.kind === kind);
		if (match) return match;
	}
	return undefined;
}

function serializePermission(
	request: PendingPermission,
): Record<string, unknown> {
	return {
		requestId: request.requestId,
		title: request.toolCall.title ?? null,
		requestedAt: request.requestedAt,
		multiSelect: request.multiSelect ?? false,
		options: request.options.map((option) => ({
			optionId: option.optionId,
			name: option.name,
			kind: option.kind,
		})),
	};
}
