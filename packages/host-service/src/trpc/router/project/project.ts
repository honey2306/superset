import { basename } from "node:path";
import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import { BRANCH_PREFIX_MODES } from "@superset/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	emitProjectChanged,
	toProjectSnapshot,
	updateLocalProject,
} from "../../../projects/local-project-store";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import { deleteLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";
import { normalizeWorktreeBaseDir } from "../workspace-creation/shared/worktree-paths";
import { getGitHubRemotes } from "./utils/git-remote";
import {
	resolveLocalRepo,
	tryRevParseGitRoot,
	validateDirectoryPath,
} from "./utils/resolve-repo";

export const projectRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.db
			.select()
			.from(projects)
			.all()
			.map((row) => ({
				id: row.id,
				// Empty until the backfill sweep fills it; folder name is the
				// honest fallback (same rule as toProjectSnapshot).
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt || row.createdAt,
			}));
	}),

	/** Rename. Commits locally — projects have no cloud dependency. */
	update: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
				input.projectId,
				{ name: input.name },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(row);
		}),

	get: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			const row = ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!row) return null;
			return {
				id: row.id,
				// Same fallback rule as project.list / toProjectSnapshot.
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				branchPrefixMode: row.branchPrefixMode,
				branchPrefixCustom: row.branchPrefixCustom,
			};
		}),

	setWorktreeBaseDir: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				path: z.string().nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const worktreeBaseDir = normalizeWorktreeBaseDir(input.path);
			const project = ctx.catalog.updateProject(input.projectId, {
				worktreeBaseDir,
			});
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}

			return {
				id: project.id,
				worktreeBaseDir: project.worktreeBaseDir ?? null,
			};
		}),

	/**
	 * Set this project's branch-prefix override. A `null` mode clears the
	 * override so the project falls back to the host-wide default.
	 */
	setBranchPrefix: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				mode: z.enum(BRANCH_PREFIX_MODES).nullable(),
				customPrefix: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const updated = ctx.catalog.updateProject(input.projectId, {
				branchPrefixMode: input.mode,
				branchPrefixCustom: input.customPrefix ?? null,
			});
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Project not set up locally: ${input.projectId}`,
				});
			}
			return { success: true as const };
		}),

	findBackfillConflict: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repoPath: z.string().min(1),
			}),
		)
		.query(() => {
			// Multiple v2 projects may point at the same GitHub URL, so a matching
			// repo URL is no longer a conflict. Kept for backwards-compatible
			// clients while older settings screens still call the endpoint.
			return { conflict: null };
		}),

	findByPath: protectedProcedure
		.input(
			z.object({
				repoPath: z.string().min(1),
				/**
				 * Opt-in to the v1→v2 importer's discovery semantics: walk
				 * every GitHub remote on the repo (not just origin/first),
				 * try `expectedRemoteUrl` against cloud, and surface stale
				 * local-DB rows. Default `false` preserves the long-standing
				 * folder-first import behavior — local-DB hit short-circuits
				 * before any cloud call, and only the primary remote is
				 * cloud-queried.
				 */
				walkAllRemotes: z.boolean().optional(),
				/**
				 * Hint about the remote URL the caller *thinks* this project
				 * tracks (e.g. v1's recorded githubOwner). Only consulted
				 * when `walkAllRemotes` is true.
				 */
				expectedRemoteUrl: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Detect "folder isn't a git repo yet" without throwing, so the import
			// UI can offer to `git init` it (create importLocal + initIfNeeded)
			// instead of dead-ending on a BAD_REQUEST. Additive optional field —
			// repo paths never carry needsGitInit, so existing callers are
			// unaffected.
			const root = await tryRevParseGitRoot(input.repoPath);
			if (root === null) {
				validateDirectoryPath(input.repoPath, "Path"); // 400 on missing / not-a-dir
				return {
					candidates: [],
					cloudErrors: [] as { url: string; message: string }[],
					needsGitInit: true as const,
				};
			}

			const resolved = await resolveLocalRepo(root);
			const gitRoot = resolved.repoPath;

			const expectedParsed =
				input.walkAllRemotes && input.expectedRemoteUrl
					? parseGitHubRemote(input.expectedRemoteUrl)
					: null;
			const expectedUrlLower = expectedParsed?.url.toLowerCase();
			const matches = (cloneUrl: string | null) =>
				!!expectedUrlLower &&
				!!cloneUrl &&
				cloneUrl.toLowerCase() === expectedUrlLower;

			interface Candidate {
				id: string;
				name: string;
				repoCloneUrl: string | null;
				source: "local-path" | "remote";
				matchesExpected: boolean;
				/** True when the cloud-URL loop returned this id, which means
				 *  it's reachable in cloud — lets us skip the per-id v2Project.get
				 *  staleness check. Internal; not part of the wire response. */
				cloudConfirmed: boolean;
				/** True when this v2 project is no longer reachable in cloud
				 *  (e.g. deleted) but a stale row still lives in this device's
				 *  local DB. Caller-side filter drops these. */
				staleLocalLink: boolean;
			}

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.repoPath, gitRoot) })
				.sync();

			// Default behavior (folder-first import): purely local. A local-DB
			// hit is the only candidate source — no hit means the caller
			// creates a fresh local project; the cloud is never consulted.
			if (!input.walkAllRemotes) {
				if (localProject) {
					return {
						candidates: [
							{
								id: localProject.id,
								name:
									localProject.name ||
									localProject.repoName ||
									basename(gitRoot),
								repoCloneUrl: localProject.repoUrl ?? null,
								source: "local-path" as const,
								matchesExpected: false,
								staleLocalLink: false,
							},
						],
						cloudErrors: [] as { url: string; message: string }[],
					};
				}
				return { candidates: [], cloudErrors: [] };
			}

			// walkAllRemotes branch — v1→v2 importer.
			const allRemotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));

			const urlsToQuery = new Map<string, ParsedGitHubRemote>();
			for (const parsed of allRemotes.values()) {
				urlsToQuery.set(parsed.url.toLowerCase(), parsed);
			}
			if (expectedParsed) {
				urlsToQuery.set(expectedParsed.url.toLowerCase(), expectedParsed);
			}

			const byId = new Map<string, Candidate>();

			if (localProject) {
				byId.set(localProject.id, {
					id: localProject.id,
					name: localProject.repoName ?? basename(gitRoot),
					repoCloneUrl: localProject.repoUrl ?? null,
					source: "local-path",
					matchesExpected: matches(localProject.repoUrl ?? null),
					cloudConfirmed: false,
					staleLocalLink: false,
				});
			}

			// Cloud lookup for every URL we know about.
			const cloudErrors: { url: string; message: string }[] = [];
			for (const parsed of urlsToQuery.values()) {
				try {
					const { candidates } =
						await ctx.api.v2Project.findByGitHubRemote.query({
							organizationId: ctx.organizationId,
							repoCloneUrl: parsed.url,
						});
					for (const c of candidates) {
						const existing = byId.get(c.id);
						if (existing) {
							// Already have it from local-DB lookup; the cloud
							// confirms it's reachable, so keep `local-path`
							// source but populate matchesExpected if needed
							// and flip `cloudConfirmed` so we skip the post-
							// loop staleness round-trip.
							existing.matchesExpected =
								existing.matchesExpected || matches(parsed.url);
							existing.repoCloneUrl = existing.repoCloneUrl ?? parsed.url;
							existing.cloudConfirmed = true;
						} else {
							byId.set(c.id, {
								id: c.id,
								name: c.name,
								repoCloneUrl: parsed.url,
								source: "remote",
								matchesExpected: matches(parsed.url),
								cloudConfirmed: true,
								staleLocalLink: false,
							});
						}
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					cloudErrors.push({ url: parsed.url, message });
					console.warn(
						"[project.findByPath] cloud findByGitHubRemote failed for",
						parsed.url,
						err,
					);
				}
			}

			// Detect stale local-DB row: returned by the path lookup but
			// cloud never confirmed it via any remote URL. Most likely the
			// cloud project was deleted by another device or user. Skip
			// when the cloud loop already saw this id (cloudConfirmed) —
			// no need for a second round-trip.
			if (localProject) {
				const candidate = byId.get(localProject.id);
				if (
					candidate &&
					candidate.source === "local-path" &&
					!candidate.cloudConfirmed
				) {
					try {
						await ctx.api.v2Project.get.query({
							organizationId: ctx.organizationId,
							id: localProject.id,
						});
					} catch (err) {
						// Only treat a confirmed not-found as stale. Transient
						// network/auth/5xx errors should leave the local link
						// intact and surface via cloudErrors instead, so we
						// don't drop a probably-still-valid candidate on a
						// blip.
						const code =
							typeof err === "object" && err !== null
								? ((err as { data?: { code?: string } }).data?.code ?? null)
								: null;
						if (code === "NOT_FOUND") {
							candidate.staleLocalLink = true;
						} else {
							cloudErrors.push({
								url: `v2Project.get(${localProject.id})`,
								message: err instanceof Error ? err.message : String(err),
							});
						}
					}
				}
			}

			// Sort: matchesExpected first, then alphabetic. Strip the
			// internal `cloudConfirmed` flag — it's a server-side
			// optimization, not part of the wire contract.
			const candidates = Array.from(byId.values())
				.filter((c) => !c.staleLocalLink)
				.sort((a, b) => {
					if (a.matchesExpected !== b.matchesExpected) {
						return a.matchesExpected ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				})
				.map(({ cloudConfirmed: _omit, ...rest }) => rest);

			// Caller surfaces this when there are no candidates and at least
			// one cloud query failed — so users see a clear "couldn't reach
			// cloud" instead of a misleading "Import" (which would create a
			// duplicate v2 project).
			return { candidates, cloudErrors };
		}),

	/**
	 * Project-delete saga. Local is reality — the local deletes are the
	 * commit point, run first, and are fully offline-capable:
	 *
	 *   1. Ownership check: an id this host doesn't serve is a no-op —
	 *      never a legacy cloud delete.
	 *
	 *   2. Best-effort `git worktree remove` for each non-main local
	 *      workspace so subsequent worktree commands aren't confused.
	 *
	 *   3. Local DB rows (workspaces + project). A failure here surfaces as
	 *      an error — the local table is what the UI lists from, so a
	 *      swallowed failure would toast "Deleted" over a surviving row.
	 *
	 *   4. Fire-and-forget legacy-cloud v2Project.delete (cascades old cloud
	 *      workspace mirrors). Never awaited — a blackholed network must not
	 *      stall the local commit point.
	 *
	 * The on-disk repo directory is NEVER auto-removed. The user's code is
	 * their code; deletion of the working tree must be an explicit action,
	 * not a side-effect of project removal. Returns repoPath so a future
	 * UI can offer an explicit "delete files too" follow-up.
	 */
	remove: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();
			if (!localProject) return { success: true, repoPath: null };

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				if (ws.worktreePath === localProject.repoPath) continue;
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.remove] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				// Route both cascade deletes and the project delete through
				// the Catalog so the journal reflects one atomic clear.
				for (const ws of localWorkspaces) {
					deleteLocalWorkspace(
						{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
						ws.id,
					);
				}
				ctx.catalog.deleteProject(input.projectId);
				emitProjectChanged(ctx.eventBus, "deleted", input.projectId);
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to delete project locally: ${err instanceof Error ? err.message : String(err)}`,
				});
			}

			void ctx.api.v2Project.delete
				.mutate({
					organizationId: ctx.organizationId,
					id: input.projectId,
				})
				.catch((err) => {
					console.warn(
						"[project.remove] legacy cloud cleanup failed; frozen mirror row may remain",
						{ projectId: input.projectId, err },
					);
				});

			return { success: true, repoPath: localProject.repoPath };
		}),
});
