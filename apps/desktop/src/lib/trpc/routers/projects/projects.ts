import {
	BRANCH_PREFIX_MODES,
	EXTERNAL_APPS,
	projects,
	type SelectProject,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { desc, eq, isNotNull } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { localDb } from "main/lib/local-db";
import {
	deleteProjectIcon,
	saveProjectIconFromDataUrl,
} from "main/lib/project-icons";
import { PROJECT_COLOR_VALUES } from "shared/constants/project-colors";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { resolveDefaultEditor } from "../external";
import {
	getGitAuthorName,
	sanitizeAuthorPrefix,
} from "../workspaces/utils/git";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { discoverAndSaveProjectIcon } from "./utils/favicon-discovery";
import { fetchGitHubOwner, getGitHubAvatarUrl } from "./utils/github";

type Project = SelectProject;

/**
 * Parses and transforms raw GitHub PR data from CLI output.
 * Filters valid PR objects and maps them to our internal format.
 */
function isRawPullRequest(item: unknown): item is {
	number: number;
	title: string;
	url: string;
	state: string;
	isDraft: boolean;
} {
	if (typeof item !== "object" || item === null) return false;

	const value = item as Record<string, unknown>;
	return (
		typeof value.number === "number" &&
		typeof value.title === "string" &&
		typeof value.url === "string" &&
		typeof value.state === "string" &&
		typeof value.isDraft === "boolean"
	);
}

function parsePullRequests(raw: unknown) {
	if (!Array.isArray(raw)) return [];

	return raw.filter(isRawPullRequest).map((pr) => ({
		prNumber: pr.number,
		title: pr.title,
		url: pr.url,
		state: pr.isDraft
			? "draft"
			: pr.state === "OPEN"
				? "open"
				: pr.state.toLowerCase(),
	}));
}

/** Create the tRPC router for project CRUD, branch listing, and git operations. */
export const createProjectsRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }): Project => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Project ${input.id} not found`,
					});
				}

				return project;
			}),

		getDefaultApp: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				return resolveDefaultEditor(input.projectId);
			}),

		getRecents: publicProcedure.query((): Project[] => {
			return localDb
				.select()
				.from(projects)
				.where(isNotNull(projects.tabOrder))
				.orderBy(desc(projects.lastOpenedAt))
				.all();
		}),

		listPullRequests: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					includeClosed: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) return [];

				try {
					const { stdout } = await execWithShellEnv(
						"gh",
						[
							"pr",
							"list",
							"--state",
							input.includeClosed ? "all" : "open",
							"--limit",
							"30",
							"--json",
							"number,title,url,state,isDraft",
						],
						{ cwd: project.mainRepoPath },
					);
					const raw: unknown = JSON.parse(stdout.trim() || "[]");
					return parsePullRequests(raw);
				} catch (err) {
					console.warn("[listPullRequests] Failed to list PRs:", err);
					return [];
				}
			}),

		searchPullRequests: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					query: z.string(),
					includeClosed: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) return [];

				try {
					const { stdout } = await execWithShellEnv(
						"gh",
						[
							"pr",
							"list",
							"--state",
							input.includeClosed ? "all" : "open",
							"--search",
							input.query,
							"--limit",
							"100",
							"--json",
							"number,title,url,state,isDraft",
						],
						{ cwd: project.mainRepoPath, timeout: 10_000 },
					);
					const raw: unknown = JSON.parse(stdout.trim() || "[]");
					return parsePullRequests(raw);
				} catch (err) {
					console.warn("[searchPullRequests] Failed to search PRs:", err);
					return [];
				}
			}),

		listIssues: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					includeClosed: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) return [];

				try {
					const { stdout } = await execWithShellEnv(
						"gh",
						[
							"issue",
							"list",
							"--state",
							input.includeClosed ? "all" : "open",
							"--limit",
							"30",
							"--json",
							"number,title,url,state,labels",
						],
						{ cwd: project.mainRepoPath, timeout: 10000 },
					);
					const raw: unknown = JSON.parse(stdout.trim() || "[]");

					// Runtime validation with zod schema
					const IssueListItemSchema = z.object({
						number: z.number(),
						title: z.string(),
						url: z.string(),
						state: z.string(),
						labels: z.array(z.unknown()).optional(),
					});

					const issuesArray = z.array(IssueListItemSchema).safeParse(raw);
					if (!issuesArray.success) {
						console.warn(
							"[listIssues] Invalid response format:",
							issuesArray.error,
						);
						return [];
					}

					return issuesArray.data.map((issue) => ({
						issueNumber: issue.number,
						title: issue.title,
						url: issue.url,
						state: issue.state === "OPEN" ? "open" : issue.state.toLowerCase(),
					}));
				} catch (err) {
					console.warn("[listIssues] Failed to list issues:", err);
					return [];
				}
			}),

		getIssueContent: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					issueNumber: z.number().int().positive(),
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Project ${input.projectId} not found`,
					});
				}

				try {
					const { stdout } = await execWithShellEnv(
						"gh",
						[
							"issue",
							"view",
							String(input.issueNumber),
							"--json",
							"number,title,body,url,state,author,createdAt,updatedAt",
						],
						{ cwd: project.mainRepoPath, timeout: 10000 },
					);
					const raw: unknown = JSON.parse(stdout.trim() || "{}");

					// Runtime validation with zod schema
					const IssueSchema = z.object({
						number: z.number(),
						title: z.string(),
						body: z.string(),
						url: z.string(),
						state: z.string(),
						author: z.object({ login: z.string() }).optional(),
						createdAt: z.string().optional(),
						updatedAt: z.string().optional(),
					});

					const issue = IssueSchema.parse(raw);

					return {
						number: issue.number,
						title: issue.title,
						body: issue.body || "",
						url: issue.url,
						state: issue.state === "OPEN" ? "open" : issue.state.toLowerCase(),
						author: issue.author?.login,
						createdAt: issue.createdAt,
						updatedAt: issue.updatedAt,
					};
				} catch (err) {
					console.warn(
						`[getIssueContent] Failed to fetch issue #${input.issueNumber}:`,
						err,
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
			}),

		selectDirectory: publicProcedure
			.input(
				z.object({
					defaultPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const window = getWindow();
				if (!window) {
					return { canceled: true as const, path: null };
				}
				const result = await dialog.showOpenDialog(window, {
					properties: ["openDirectory", "createDirectory"],
					title: "Select Directory",
					defaultPath: input.defaultPath,
				});
				if (result.canceled || result.filePaths.length === 0) {
					return { canceled: true as const, path: null };
				}
				return { canceled: false as const, path: result.filePaths[0] };
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().trim().min(1).optional(),
						color: z
							.string()
							.refine(
								(value) => PROJECT_COLOR_VALUES.includes(value),
								"Invalid project color",
							)
							.optional(),
						branchPrefixMode: z.enum(BRANCH_PREFIX_MODES).nullable().optional(),
						branchPrefixCustom: z.string().nullable().optional(),
						workspaceBaseBranch: z.string().nullable().optional(),
						worktreeBaseDir: z.string().nullable().optional(),
						hideImage: z.boolean().optional(),
						defaultApp: z.enum(EXTERNAL_APPS).nullable().optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();
				if (!project) {
					throw new Error(`Project ${input.id} not found`);
				}

				localDb
					.update(projects)
					.set({
						...(input.patch.name !== undefined && { name: input.patch.name }),
						...(input.patch.color !== undefined && {
							color: input.patch.color,
						}),
						...(input.patch.branchPrefixMode !== undefined && {
							branchPrefixMode: input.patch.branchPrefixMode,
						}),
						...(input.patch.branchPrefixCustom !== undefined && {
							branchPrefixCustom: input.patch.branchPrefixCustom,
						}),
						...(input.patch.workspaceBaseBranch !== undefined && {
							workspaceBaseBranch: input.patch.workspaceBaseBranch,
						}),
						...(input.patch.worktreeBaseDir !== undefined && {
							worktreeBaseDir: input.patch.worktreeBaseDir,
						}),
						...(input.patch.hideImage !== undefined && {
							hideImage: input.patch.hideImage,
						}),
						...(input.patch.defaultApp !== undefined && {
							defaultApp: input.patch.defaultApp,
						}),
						lastOpenedAt: Date.now(),
					})
					.where(eq(projects.id, input.id))
					.run();

				return { success: true };
			}),

		reorder: publicProcedure
			.input(
				z.object({
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const { fromIndex, toIndex } = input;

				const activeProjects = localDb
					.select()
					.from(projects)
					.where(eq(projects.tabOrder, projects.tabOrder)) // Just get all with non-null tabOrder
					.all()
					.filter((p) => p.tabOrder !== null)
					.sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0));

				if (
					fromIndex < 0 ||
					fromIndex >= activeProjects.length ||
					toIndex < 0 ||
					toIndex >= activeProjects.length
				) {
					throw new Error("Invalid fromIndex or toIndex");
				}

				const [removed] = activeProjects.splice(fromIndex, 1);
				activeProjects.splice(toIndex, 0, removed);

				for (let i = 0; i < activeProjects.length; i++) {
					localDb
						.update(projects)
						.set({ tabOrder: i })
						.where(eq(projects.id, activeProjects[i].id))
						.run();
				}

				return { success: true };
			}),

		linkToNeon: publicProcedure
			.input(z.object({ id: z.string(), neonProjectId: z.string() }))
			.mutation(({ input }) => {
				localDb
					.update(projects)
					.set({ neonProjectId: input.neonProjectId })
					.where(eq(projects.id, input.id))
					.run();
				return { success: true };
			}),

		getGitHubAvatar: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					console.log("[getGitHubAvatar] Project not found:", input.id);
					return null;
				}

				if (project.githubOwner) {
					console.log(
						"[getGitHubAvatar] Using cached owner:",
						project.githubOwner,
					);
					return {
						owner: project.githubOwner,
						avatarUrl: getGitHubAvatarUrl(project.githubOwner),
					};
				}

				console.log(
					"[getGitHubAvatar] Fetching owner for:",
					project.mainRepoPath,
				);
				const owner = await fetchGitHubOwner(project.mainRepoPath);

				if (!owner) {
					console.log("[getGitHubAvatar] Failed to fetch owner");
					return null;
				}

				console.log("[getGitHubAvatar] Fetched owner:", owner);

				localDb
					.update(projects)
					.set({ githubOwner: owner })
					.where(eq(projects.id, input.id))
					.run();

				return {
					owner,
					avatarUrl: getGitHubAvatarUrl(owner),
				};
			}),

		getGitAuthor: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					return null;
				}

				const authorName = await getGitAuthorName(project.mainRepoPath);
				if (!authorName) {
					return null;
				}

				return {
					name: authorName,
					prefix: sanitizeAuthorPrefix(authorName),
				};
			}),

		triggerFaviconDiscovery: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Project ${input.id} not found`,
					});
				}

				// Skip if the project already has an icon
				if (project.iconUrl) {
					return { iconUrl: project.iconUrl };
				}

				const iconUrl = await discoverAndSaveProjectIcon({
					projectId: project.id,
					repoPath: project.mainRepoPath,
				});

				if (iconUrl) {
					localDb
						.update(projects)
						.set({ iconUrl })
						.where(eq(projects.id, input.id))
						.run();
				}

				return { iconUrl };
			}),

		setProjectIcon: publicProcedure
			.input(
				z.object({
					id: z.string(),
					icon: z.string().nullable(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Project ${input.id} not found`,
					});
				}

				if (input.icon === null) {
					// Remove icon
					deleteProjectIcon(input.id);
					localDb
						.update(projects)
						.set({ iconUrl: null })
						.where(eq(projects.id, input.id))
						.run();
					return { iconUrl: null };
				}

				// Save icon from data URL
				const iconUrl = await saveProjectIconFromDataUrl({
					projectId: input.id,
					dataUrl: input.icon,
				});

				localDb
					.update(projects)
					.set({ iconUrl })
					.where(eq(projects.id, input.id))
					.run();

				return { iconUrl };
			}),
	});
};

export type ProjectsRouter = ReturnType<typeof createProjectsRouter>;
