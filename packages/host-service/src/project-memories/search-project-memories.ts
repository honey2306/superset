import { basename } from "node:path";
import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import type { HostDb } from "../db";
import { projectMemories, projects } from "../db/schema";
import type { MemoryAccessSettings } from "./memory-access-settings";
import {
	markProjectMemoriesUsed,
	resolveProjectIdForWorkspace,
} from "./project-memory-store";

function requireSourceProject(db: HostDb, workspaceId: string) {
	const projectId = resolveProjectIdForWorkspace(db, workspaceId);
	if (!projectId) throw new Error(`Workspace not found: ${workspaceId}`);
	return projectId;
}

/** The current project is always readable; sharing only exposes repository projects. */
function accessibleProjectCondition(
	sourceProjectId: string,
	settings: MemoryAccessSettings,
) {
	const shared =
		settings.mode === "all"
			? eq(projects.kind, "repository")
			: settings.mode === "selected" && settings.projectIds.length > 0
				? and(
						eq(projects.kind, "repository"),
						inArray(projects.id, settings.projectIds),
					)
				: sql`false`;
	return or(eq(projects.id, sourceProjectId), shared);
}

export function listMemoryProjects(
	db: HostDb,
	input: {
		workspaceId: string;
		query: string;
		limit: number;
	},
	settings: MemoryAccessSettings,
) {
	const projectId = requireSourceProject(db, input.workspaceId);
	const query = input.query.trim();
	const rows = db
		.select({
			id: projects.id,
			name: projects.name,
			repoPath: projects.repoPath,
		})
		.from(projects)
		.where(
			and(
				accessibleProjectCondition(projectId, settings),
				query
					? or(
							sql`instr(lower(${projects.name}), lower(${query})) > 0`,
							sql`instr(lower(${projects.repoPath}), lower(${query})) > 0`,
						)
					: undefined,
			),
		)
		.orderBy(
			sql`case when ${projects.id} = ${projectId} then 0 else 1 end`,
			asc(projects.name),
			asc(projects.id),
		)
		.limit(input.limit + 1)
		.all();
	return {
		projectId,
		accessMode: settings.mode,
		hasMore: rows.length > input.limit,
		projects: rows.slice(0, input.limit).map((project) => ({
			...project,
			name: project.name || basename(project.repoPath),
			readOnly: project.id !== projectId,
		})),
	};
}

export function searchProjectMemories(
	db: HostDb,
	input: {
		workspaceId: string;
		query: string;
		limit: number;
		scope: "project" | "global" | "all" | "accessible";
		projectId?: string;
	},
	settings: MemoryAccessSettings,
) {
	const projectId = requireSourceProject(db, input.workspaceId);
	if (input.projectId !== undefined && input.scope !== "project") {
		throw new Error("projectId requires scope project.");
	}
	const targetProjectId = input.projectId ?? projectId;
	if (input.scope === "project" && targetProjectId !== projectId) {
		const permitted = db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.id, targetProjectId),
					accessibleProjectCondition(projectId, settings),
				),
			)
			.get();
		if (!permitted)
			throw new Error(
				"Project memory is unavailable or not permitted by memory access settings.",
			);
	}
	const globalCondition = isNull(projectMemories.projectId);
	const scopeCondition =
		input.scope === "global"
			? globalCondition
			: input.scope === "project"
				? eq(projectMemories.projectId, targetProjectId)
				: input.scope === "all"
					? or(eq(projectMemories.projectId, projectId), globalCondition)
					: or(
							accessibleProjectCondition(projectId, settings),
							globalCondition,
						);
	const query = input.query.trim();
	const rows = db
		.select({
			...getTableColumns(projectMemories),
			projectName: projects.name,
			projectRepoPath: projects.repoPath,
		})
		.from(projectMemories)
		.leftJoin(projects, eq(projects.id, projectMemories.projectId))
		.where(
			and(
				scopeCondition,
				eq(projectMemories.enabled, true),
				query
					? or(
							sql`instr(lower(${projectMemories.title}), lower(${query})) > 0`,
							sql`instr(lower(${projectMemories.content}), lower(${query})) > 0`,
							sql`instr(lower(${projectMemories.category}), lower(${query})) > 0`,
						)
					: undefined,
			),
		)
		.orderBy(
			sql`case when ${projectMemories.projectId} = ${projectId} then 0 when ${projectMemories.projectId} is null then 1 else 2 end`,
			desc(projectMemories.pinned),
			desc(projectMemories.updatedAt),
			asc(projectMemories.id),
		)
		.limit(input.limit + 1)
		.all();
	const memories = rows.slice(0, input.limit).map((memory) => ({
		...memory,
		projectName:
			memory.projectId === null
				? null
				: memory.projectName || basename(memory.projectRepoPath ?? ""),
		scope:
			memory.projectId === null
				? ("global" as const)
				: memory.projectId === projectId
					? ("project" as const)
					: ("external" as const),
		readOnly: memory.projectId !== null && memory.projectId !== projectId,
	}));
	markProjectMemoriesUsed(
		db,
		memories.map((memory) => memory.id),
	);
	return {
		projectId,
		scope: input.scope,
		hasMore: rows.length > input.limit,
		memories,
	};
}
