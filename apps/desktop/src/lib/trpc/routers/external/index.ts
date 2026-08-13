import nodePath from "node:path";
import {
	EXTERNAL_APPS,
	type OpenInAppLocation,
	openInAppInputSchema,
} from "@superset/shared/desktop-types";
import { TRPCError } from "@trpc/server";
import { clipboard, shell } from "electron";
import { externalUrlLogLabel, isSafeExternalUrl } from "main/lib/safe-url";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	type ExternalApp,
	getAppCommand,
	RelativePathWithoutCwdError,
	resolvePath,
	spawnAsync,
} from "./helpers";

/**
 * Wraps a tRPC handler so a `RelativePathWithoutCwdError` (thrown by
 * `resolvePath` when a relative path arrives without a `worktreePath`)
 * surfaces as a clear BAD_REQUEST with the root-cause message instead
 * of a generic 500.
 */
async function withResolveGuard<T>(fn: () => Promise<T> | T): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof RelativePathWithoutCwdError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
		}
		throw err;
	}
}

const ExternalAppSchema = z.enum(EXTERNAL_APPS);

async function openPathInApp(
	filePath: string,
	app: ExternalApp,
	location?: OpenInAppLocation,
): Promise<void> {
	if (app === "finder") {
		shell.showItemInFolder(filePath);
		return;
	}

	const candidates = getAppCommand(app, filePath, process.platform, location);
	if (candidates) {
		let lastError: Error | undefined;
		for (const cmd of candidates) {
			try {
				await spawnAsync(cmd.command, cmd.args);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (candidates.length > 1) {
					console.warn(
						`[external/openInApp] ${cmd.args[1]} not found, trying next candidate`,
					);
				}
			}
		}
		throw lastError;
	}

	await shell.openPath(filePath);
}

/**
 * External operations router.
 * Handles opening URLs and files in external applications.
 */
export const createExternalRouter = () => {
	return router({
		openUrl: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			if (!isSafeExternalUrl(input)) {
				console.warn(
					"[external/openUrl] Blocked unsafe URL scheme:",
					externalUrlLogLabel(input),
				);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "URL scheme not allowed",
				});
			}
			try {
				await shell.openExternal(input);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				console.error(
					"[external/openUrl] Failed to open URL:",
					externalUrlLogLabel(input),
					error,
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: errorMessage,
				});
			}
		}),

		openInFinder: publicProcedure
			.input(z.string())
			.mutation(async ({ input }) => {
				shell.showItemInFolder(input);
			}),

		openInApp: publicProcedure
			.input(openInAppInputSchema.extend({ projectId: z.string().optional() }))
			.mutation(async ({ input }) => {
				// openInApp hands `path` directly to the editor CLI / shell; with no
				// cwd input there's no safe way to interpret a relative path, so we
				// reject them loudly instead of silently resolving against Electron's
				// working directory.
				if (!nodePath.isAbsolute(input.path)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `openInApp requires an absolute path (got ${JSON.stringify(input.path)}).`,
					});
				}
				await openPathInApp(input.path, input.app, input);
			}),

		copyPath: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			clipboard.writeText(input);
		}),

		copyText: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			clipboard.writeText(input);
		}),

		resolvePath: publicProcedure
			.input(
				z.object({
					path: z.string(),
					/** Absolute workspace worktree path — relative `path`s are resolved against this. */
					worktreePath: z.string().optional(),
				}),
			)
			.query(({ input }) =>
				withResolveGuard(() => resolvePath(input.path, input.worktreePath)),
			),

		openFileInEditor: publicProcedure
			.input(
				z.object({
					path: z.string(),
					line: z.number().optional(),
					column: z.number().optional(),
					/**
					 * Absolute workspace worktree path. Required when `path` is
					 * relative; ignored when `path` is already absolute. Using the
					 * workspace's worktreePath (rather than an arbitrary cwd) means
					 * relative diff/tree paths always resolve against the workspace
					 * the user is in, never Electron's process cwd.
					 */
					worktreePath: z.string().optional(),
					projectId: z.string().optional(),
					/** Explicit app selected by the renderer; OS default is used when omitted. */
					app: ExternalAppSchema.optional(),
				}),
			)
			.mutation(({ input }) =>
				withResolveGuard(async () => {
					const filePath = resolvePath(input.path, input.worktreePath);
					if (input.app) {
						await openPathInApp(filePath, input.app, input);
						return;
					}
					await shell.openPath(filePath);
				}),
			),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
