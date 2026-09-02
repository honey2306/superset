import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	type ProjectMemoryCategory,
	projectMemories,
	workspaces,
} from "../db/schema";

export const PROJECT_MEMORY_CATEGORIES = [
	"debugging",
	"architecture",
	"workflow",
	"environment",
	"preference",
	"other",
] as const satisfies readonly ProjectMemoryCategory[];

export type ProjectMemory = typeof projectMemories.$inferSelect;

export interface CreateProjectMemoryInput {
	projectId: string;
	title: string;
	content: string;
	category: ProjectMemoryCategory;
	source: "manual" | "agent";
	sourceSessionId?: string | null;
	pinned?: boolean;
}

export interface UpdateProjectMemoryInput {
	title?: string;
	content?: string;
	category?: ProjectMemoryCategory;
	pinned?: boolean;
	enabled?: boolean;
}

export function resolveProjectIdForWorkspace(
	db: HostDb,
	workspaceId: string,
): string | null {
	return (
		db
			.select({ projectId: workspaces.projectId })
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get()?.projectId ?? null
	);
}

export function listProjectMemories(
	db: HostDb,
	input: {
		projectId: string;
		query?: string;
		includeDisabled?: boolean;
		limit?: number;
	},
): ProjectMemory[] {
	const query = input.query?.trim();
	const filters = [eq(projectMemories.projectId, input.projectId)];
	if (!input.includeDisabled) filters.push(eq(projectMemories.enabled, true));
	if (query) {
		filters.push(
			or(
				sql`instr(lower(${projectMemories.title}), lower(${query})) > 0`,
				sql`instr(lower(${projectMemories.content}), lower(${query})) > 0`,
				sql`instr(lower(${projectMemories.category}), lower(${query})) > 0`,
			) ?? sql`false`,
		);
	}
	return db
		.select()
		.from(projectMemories)
		.where(and(...filters))
		.orderBy(desc(projectMemories.pinned), desc(projectMemories.updatedAt))
		.limit(input.limit ?? 200)
		.all();
}

export function createProjectMemory(
	db: HostDb,
	input: CreateProjectMemoryInput,
): { memory: ProjectMemory; created: boolean } {
	const title = input.title.trim();
	const content = input.content.trim();
	const existing = db
		.select()
		.from(projectMemories)
		.where(
			and(
				eq(projectMemories.projectId, input.projectId),
				eq(projectMemories.title, title),
				eq(projectMemories.content, content),
			),
		)
		.get();
	if (existing) return { memory: existing, created: false };

	const now = Date.now();
	const memory: ProjectMemory = {
		id: randomUUID(),
		projectId: input.projectId,
		title,
		content,
		category: input.category,
		source: input.source,
		sourceSessionId: input.sourceSessionId ?? null,
		pinned: input.pinned ?? false,
		enabled: true,
		createdAt: now,
		updatedAt: now,
		lastUsedAt: null,
	};
	db.insert(projectMemories).values(memory).run();
	return { memory, created: true };
}

export function updateProjectMemory(
	db: HostDb,
	projectId: string,
	memoryId: string,
	input: UpdateProjectMemoryInput,
): ProjectMemory | null {
	const patch = {
		...(input.title !== undefined ? { title: input.title.trim() } : {}),
		...(input.content !== undefined ? { content: input.content.trim() } : {}),
		...(input.category !== undefined ? { category: input.category } : {}),
		...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
		...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
		updatedAt: Date.now(),
	};
	db.update(projectMemories)
		.set(patch)
		.where(
			and(
				eq(projectMemories.id, memoryId),
				eq(projectMemories.projectId, projectId),
			),
		)
		.run();
	return (
		db
			.select()
			.from(projectMemories)
			.where(
				and(
					eq(projectMemories.id, memoryId),
					eq(projectMemories.projectId, projectId),
				),
			)
			.get() ?? null
	);
}

export function deleteProjectMemory(
	db: HostDb,
	projectId: string,
	memoryId: string,
): boolean {
	return (
		db
			.delete(projectMemories)
			.where(
				and(
					eq(projectMemories.id, memoryId),
					eq(projectMemories.projectId, projectId),
				),
			)
			.run().changes > 0
	);
}

export function markProjectMemoriesUsed(
	db: HostDb,
	memoryIds: readonly string[],
): void {
	if (memoryIds.length === 0) return;
	const now = Date.now();
	for (const id of memoryIds) {
		db.update(projectMemories)
			.set({ lastUsedAt: now })
			.where(eq(projectMemories.id, id))
			.run();
	}
}
