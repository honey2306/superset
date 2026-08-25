import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { HostServiceContext } from "../types";
import {
	type DeleteInProgressCause,
	isDeleteInProgressCause,
	isProjectNotSetupCause,
	isTeardownFailureCause,
	type ProjectNotSetupCause,
	type TeardownFailureCause,
} from "./error-types";

export interface RouterMeta {
	/**
	 * Per-procedure timeout in milliseconds, applied to query procedures
	 * via `queryProcedure`. Defaults to 5_000 when omitted. Set higher for
	 * procedures that legitimately take longer (e.g. searching large
	 * histories or shelling out to long-running commands).
	 */
	timeoutMs?: number;
}

const t = initTRPC
	.context<HostServiceContext>()
	.meta<RouterMeta>()
	.create({
		transformer: superjson,
		errorFormatter({ shape, error }) {
			// tRPC wraps non-Error `cause` values via getCauseFromUnknown() into a
			// synthetic UnknownCauseError that carries the original fields as own
			// properties. Superjson then serializes it as an Error (message/stack
			// only) and drops our fields. Re-build a plain object so the wire
			// format keeps `kind`, `exitCode`, `outputTail`, etc.
			const teardownFailure: TeardownFailureCause | undefined =
				isTeardownFailureCause(error.cause)
					? {
							kind: "TEARDOWN_FAILED",
							exitCode: error.cause.exitCode,
							signal: error.cause.signal,
							timedOut: error.cause.timedOut,
							outputTail: error.cause.outputTail,
						}
					: undefined;
			const projectNotSetup: ProjectNotSetupCause | undefined =
				isProjectNotSetupCause(error.cause)
					? {
							kind: "PROJECT_NOT_SETUP",
							projectId: error.cause.projectId,
						}
					: undefined;
			const deleteInProgress: DeleteInProgressCause | undefined =
				isDeleteInProgressCause(error.cause)
					? { kind: "DELETE_IN_PROGRESS" }
					: undefined;
			return {
				...shape,
				data: {
					...shape.data,
					teardownFailure,
					projectNotSetup,
					deleteInProgress,
				},
			};
		},
	});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure paths a paired phone bearer is allowed to reach. Anything not
 * matched by this allowlist responds FORBIDDEN to phone callers even
 * though its own `protectedProcedure` guard would pass. Kept as an
 * allowlist (not a blocklist) so newly-added mutations are safe-by-default.
 *
 * Only edit this list after considering blast radius. Terminal, git,
 * settings mutations, credential edits, and workspace destroy paths are
 * intentionally absent.
 */
const PHONE_ALLOWED_PATHS = new Set<string>([
	"health.check",
	"host.info",
	"phone.pairing.mint",
	"phone.pairing.redeem",
	"phone.sessions.list",
	"phone.sessions.revoke",
	"phone.me",
	"workspaceCatalog.snapshot",
	// Workspace tree and phone terminal navigation need the read-only session
	// index. Terminal mutations and daemon controls remain excluded below.
	"terminal.listSessions",
	"terminalAgents.listByWorkspace",
	"terminalAgents.getOrCreate",
]);

const PHONE_ALLOWED_PREFIXES: readonly string[] = ["acpSessions."];

export function isPhoneAllowedPath(path: string): boolean {
	if (PHONE_ALLOWED_PATHS.has(path)) return true;
	return PHONE_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
}

export const protectedProcedure = t.procedure.use(
	async ({ ctx, path, next }) => {
		if (!ctx.isAuthenticated) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid or missing authentication token.",
			});
		}
		if (ctx.authKind === "phone" && !isPhoneAllowedPath(path)) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "This operation is not available to paired phone sessions.",
			});
		}
		return next({ ctx });
	},
);

/**
 * Procedure gated to callers holding the desktop PSK. Phone-session bearers
 * are rejected with FORBIDDEN; unauthenticated callers get UNAUTHORIZED.
 */
export const pskOnlyProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.isAuthenticated) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Invalid or missing authentication token.",
		});
	}
	if (ctx.authKind === "phone") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This operation requires desktop-level auth.",
		});
	}
	return next({ ctx });
});

const DEFAULT_QUERY_TIMEOUT_MS = 5_000;

const timeoutMiddleware = t.middleware(async ({ next, type, path, meta }) => {
	if (type !== "query") return next();
	const timeoutMs = meta?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(
				new TRPCError({
					code: "TIMEOUT",
					message: `${path} timed out after ${timeoutMs}ms`,
				}),
			);
		}, timeoutMs);
	});

	try {
		return await Promise.race([next(), timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
	}
});

/**
 * Query procedures with a server-side timeout. Hung filesystem/git work
 * rejects after `meta.timeoutMs` (default 5s) so the renderer doesn't
 * spin forever. React Query is configured to retry on `TIMEOUT` errors.
 *
 * Use this for `.query` procedures only — mutations have variable
 * latency and shouldn't share a blanket budget.
 *
 * See `packages/host-service/QUERY_TIMEOUTS.md` for the policy and
 * current per-procedure budgets.
 */
export const queryProcedure = protectedProcedure.use(timeoutMiddleware);

export type {
	ProjectNotSetupCause,
	TeardownFailureCause,
} from "./error-types";
// INTERIM cross-runtime types via dist-types — see docs/interim-router-types.md
export type { AppRouter } from "./router";
