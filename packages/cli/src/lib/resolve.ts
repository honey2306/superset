/**
 * Shared helpers for resolving user-supplied resource references.
 *
 * The CLI should never force a user (or an agent) to paste a full uuid when a
 * short prefix, a name, or the current directory already identifies the
 * resource unambiguously.
 */

import { conflictError, notFoundError } from "./exit-codes";
import type { HostConnection } from "./host-connection";

export interface WorkspaceRef {
	id: string;
	name: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	type: "main" | "worktree";
}

export interface ProjectRef {
	id: string;
	name: string;
	repoPath: string;
}

export interface CatalogView {
	projects: ProjectRef[];
	workspaces: WorkspaceRef[];
}

export async function loadCatalog(
	connection: HostConnection,
): Promise<CatalogView> {
	const snapshot = await connection.client.workspaceCatalog.snapshot.query();
	return {
		projects: snapshot.projects.map((project) => ({
			id: project.id,
			name: project.name,
			repoPath: project.repoPath,
		})),
		workspaces: snapshot.workspaces.map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			projectId: workspace.projectId,
			worktreePath: workspace.worktreePath,
			branch: workspace.branch,
			type: workspace.type,
		})),
	};
}

function normalizePath(path: string): string {
	return path.replace(/\/+$/, "");
}

/**
 * The workspace whose worktree contains `cwd`, preferring the deepest match so
 * nested worktrees resolve to the innermost one.
 */
export function workspaceForDirectory(
	workspaces: readonly WorkspaceRef[],
	cwd: string,
): WorkspaceRef | undefined {
	const target = normalizePath(cwd);
	let best: WorkspaceRef | undefined;
	for (const workspace of workspaces) {
		const root = normalizePath(workspace.worktreePath);
		if (target === root || target.startsWith(`${root}/`)) {
			if (!best || root.length > normalizePath(best.worktreePath).length) {
				best = workspace;
			}
		}
	}
	return best;
}

/**
 * Resolve a workspace from an id prefix, an exact name, or a unique
 * case-insensitive substring. `current` (or an omitted reference) resolves
 * from the working directory.
 */
export function resolveWorkspace(
	workspaces: readonly WorkspaceRef[],
	reference: string | undefined,
	cwd: string,
): WorkspaceRef {
	if (!reference || reference === "current" || reference === ".") {
		const match = workspaceForDirectory(workspaces, cwd);
		if (match) return match;
		throw notFoundError(
			"The current directory is not inside a Superset workspace.",
			"Pass a workspace explicitly: --workspace <id|name>",
		);
	}

	const byId = workspaces.filter((workspace) =>
		workspace.id.startsWith(reference),
	);
	if (byId.length === 1 && byId[0]) return byId[0];
	if (byId.length > 1) {
		throw conflictError(
			`Workspace id prefix "${reference}" is ambiguous.`,
			...byId.slice(0, 5).map((w) => `  ${w.id}  ${w.name}`),
		);
	}

	const lowered = reference.toLowerCase();
	const byName = workspaces.filter(
		(workspace) => workspace.name.toLowerCase() === lowered,
	);
	if (byName.length === 1 && byName[0]) return byName[0];
	if (byName.length > 1) {
		throw conflictError(
			`Multiple workspaces are named "${reference}".`,
			...byName.slice(0, 5).map((w) => `  ${w.id}  ${w.name}`),
		);
	}

	const fuzzy = workspaces.filter((workspace) =>
		workspace.name.toLowerCase().includes(lowered),
	);
	if (fuzzy.length === 1 && fuzzy[0]) return fuzzy[0];
	if (fuzzy.length > 1) {
		throw conflictError(
			`Workspace "${reference}" is ambiguous.`,
			...fuzzy.slice(0, 5).map((w) => `  ${w.id}  ${w.name}`),
		);
	}

	throw notFoundError(`No workspace matches "${reference}".`);
}

export function resolveProject(
	projects: readonly ProjectRef[],
	reference: string,
): ProjectRef {
	const byId = projects.filter((project) => project.id.startsWith(reference));
	if (byId.length === 1 && byId[0]) return byId[0];
	if (byId.length > 1) {
		throw conflictError(`Project id prefix "${reference}" is ambiguous.`);
	}

	const lowered = reference.toLowerCase();
	const byName = projects.filter(
		(project) => project.name.toLowerCase() === lowered,
	);
	if (byName.length === 1 && byName[0]) return byName[0];
	if (byName.length > 1) {
		throw conflictError(`Multiple projects are named "${reference}".`);
	}

	throw notFoundError(`No project matches "${reference}".`);
}
