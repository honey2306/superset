/**
 * `superset workspaces` — the isolated git worktrees agents run inside.
 *
 * A workspace is the unit of isolation: each has its own worktree and branch,
 * and every session belongs to exactly one. Listing them is how a caller finds
 * where work is happening before opening or continuing a conversation.
 */

import { getFlag, getOption } from "../lib/args";
import type { CommandContext } from "../lib/context";
import { usageError } from "../lib/exit-codes";
import { truncateVisible } from "../lib/output";
import {
	loadCatalog,
	resolveWorkspace,
	type WorkspaceRef,
	workspaceForDirectory,
} from "../lib/resolve";

export const WORKSPACE_VALUE_OPTIONS = ["workspace", "project"] as const;

export async function workspacesListCommand(
	ctx: CommandContext,
): Promise<void> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);
	const projectNames = new Map(
		catalog.projects.map((project) => [project.id, project.name]),
	);

	const projectRef = getOption(ctx.args, "project");
	let workspaces = catalog.workspaces;
	if (projectRef) {
		const lowered = projectRef.toLowerCase();
		workspaces = workspaces.filter((workspace) => {
			const name = projectNames.get(workspace.projectId) ?? "";
			return (
				workspace.projectId.startsWith(projectRef) ||
				name.toLowerCase().includes(lowered)
			);
		});
	}

	const current = workspaceForDirectory(catalog.workspaces, process.cwd());

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			workspaces: workspaces.map((workspace) => ({
				...serializeWorkspace(workspace, projectNames.get(workspace.projectId)),
				isCurrent: workspace.id === current?.id,
			})),
			currentWorkspaceId: current?.id ?? null,
		});
		return;
	}

	if (workspaces.length === 0) {
		ctx.out.line(ctx.out.dim("No workspaces."));
		return;
	}

	ctx.out.line();
	ctx.out.table(
		workspaces.map((workspace) => [
			workspace.id === current?.id ? ctx.out.green("●") : " ",
			workspace.id.slice(0, 8),
			truncateVisible(workspace.name, 32),
			ctx.out.dim(truncateVisible(workspace.branch, 26)),
			// Always show the project: it is what distinguishes rows, whereas the
			// type is "main" for most workspaces and says nothing useful.
			ctx.out.dim(
				truncateVisible(projectNames.get(workspace.projectId) ?? "—", 22),
			),
			workspace.type === "worktree" ? ctx.out.dim("worktree") : "",
		]),
	);
	ctx.out.line();
	if (current) {
		ctx.out.line(ctx.out.dim(`● current directory → ${current.name}`));
		ctx.out.line();
	}
}

export async function workspacesGetCommand(ctx: CommandContext): Promise<void> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);
	const workspace = resolveWorkspace(
		catalog.workspaces,
		ctx.args.positionals[2] ?? getOption(ctx.args, "workspace", "w"),
		process.cwd(),
	);
	const project = catalog.projects.find(
		(entry) => entry.id === workspace.projectId,
	);

	// Git status is a separate call because it shells out; only fetch it when
	// the caller actually wants the detail view.
	const wantsGit = !getFlag(ctx.args, "no-git");
	const gitStatus = wantsGit
		? await connection.client.workspace.gitStatus
				.query({ id: workspace.id })
				.catch(() => undefined)
		: undefined;

	const sessions = await connection.client.acpSessions.list.query({
		excludeEmpty: true,
		limit: 200,
		workspaceId: workspace.id,
	});

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			...serializeWorkspace(workspace, project?.name),
			git: gitStatus
				? {
						branch: gitStatus.branch,
						isClean: gitStatus.isClean,
						changedFiles: gitStatus.files.length,
					}
				: null,
			sessions: sessions.items.length,
		});
		return;
	}

	ctx.out.line();
	ctx.out.line(ctx.out.bold(workspace.name));
	ctx.out.line();
	ctx.out.table([
		[ctx.out.dim("id"), workspace.id],
		[ctx.out.dim("project"), project?.name ?? workspace.projectId],
		[ctx.out.dim("branch"), workspace.branch],
		[ctx.out.dim("type"), workspace.type],
		[ctx.out.dim("path"), workspace.worktreePath],
		...(gitStatus
			? [
					[
						ctx.out.dim("git"),
						gitStatus.isClean
							? ctx.out.green("clean")
							: ctx.out.yellow(
									`${gitStatus.files.length} uncommitted change${
										gitStatus.files.length === 1 ? "" : "s"
									}`,
								),
					],
				]
			: []),
		[ctx.out.dim("sessions"), String(sessions.items.length)],
	]);
	ctx.out.line();
}

export async function projectsListCommand(ctx: CommandContext): Promise<void> {
	const connection = await ctx.host();
	const catalog = await loadCatalog(connection);

	const workspaceCounts = new Map<string, number>();
	for (const workspace of catalog.workspaces) {
		workspaceCounts.set(
			workspace.projectId,
			(workspaceCounts.get(workspace.projectId) ?? 0) + 1,
		);
	}

	if (ctx.out.isMachineReadable) {
		ctx.out.json({
			projects: catalog.projects.map((project) => ({
				id: project.id,
				name: project.name,
				repoPath: project.repoPath,
				workspaces: workspaceCounts.get(project.id) ?? 0,
			})),
		});
		return;
	}

	if (catalog.projects.length === 0) {
		ctx.out.line(ctx.out.dim("No projects."));
		return;
	}

	ctx.out.line();
	ctx.out.table(
		catalog.projects.map((project) => [
			project.id.slice(0, 8),
			truncateVisible(project.name, 30),
			ctx.out.dim(
				`${workspaceCounts.get(project.id) ?? 0} workspace${
					(workspaceCounts.get(project.id) ?? 0) === 1 ? "" : "s"
				}`,
			),
			ctx.out.dim(truncateVisible(project.repoPath, 44)),
		]),
	);
	ctx.out.line();
}

function serializeWorkspace(
	workspace: WorkspaceRef,
	projectName?: string,
): Record<string, unknown> {
	return {
		id: workspace.id,
		name: workspace.name,
		projectId: workspace.projectId,
		project: projectName,
		branch: workspace.branch,
		type: workspace.type,
		worktreePath: workspace.worktreePath,
	};
}

/** Shared usage error for an unknown `workspaces` subcommand. */
export function unknownWorkspacesSubcommand(subcommand: string): never {
	throw usageError(
		`Unknown subcommand: workspaces ${subcommand}`,
		"Try: superset workspaces list",
	);
}
