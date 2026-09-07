import { z } from "zod";
import {
	CHANGES_PAGE_DEFAULT_LIMIT,
	CHANGES_PAGE_MAX_LIMIT,
} from "../../../workspace-catalog";
import { protectedProcedure, router } from "../../index";

const changesInputSchema = z.object({
	afterRevision: z.number().int().nonnegative(),
	limit: z
		.number()
		.int()
		.min(1)
		.max(CHANGES_PAGE_MAX_LIMIT)
		.optional()
		.default(CHANGES_PAGE_DEFAULT_LIMIT),
});

/**
 * Workspace Catalog Module transport. `snapshot` fetches the current
 * projection in one read transaction and returns the highest revision so
 * the client can pin its cursor. `changes` replays the durable journal
 * from a cursor; both are safe against dropped `catalog:changed` events.
 */
export const workspaceCatalogRouter = router({
	snapshot: protectedProcedure.query(({ ctx }) => ctx.catalog.snapshot()),
	/**
	 * Phone home bootstrap. Keep the catalog projection and the global ACP page
	 * behind one request so a phone with many workspaces does not fan out into
	 * one `acpSessions.list` call per workspace.
	 */
	phoneSnapshot: protectedProcedure.query(async ({ ctx }) => {
		const [catalog, acp] = await Promise.all([
			Promise.resolve(ctx.catalog.snapshot()),
			ctx.runtime.acpSessionsEnabled
				? ctx.runtime.acpSessions.list({ limit: 200 })
				: Promise.resolve({
						items: [],
						nextCursor: null,
						enabled: false,
					}),
		]);
		return { catalog, acp };
	}),
	changes: protectedProcedure
		.input(changesInputSchema)
		.query(({ ctx, input }) =>
			ctx.catalog.changes(input.afterRevision, input.limit),
		),
});
