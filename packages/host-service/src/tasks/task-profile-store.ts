import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	type TaskProfile,
	type TaskProfileSnapshot,
	taskProfileSchema,
} from "@superset/shared/tasks";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, taskProfiles } from "../db/schema";

/** Versioned, user-approved project rules. Discovery returns suggestions only. */
export class TaskProfileStore {
	constructor(private readonly db: HostDb) {}
	private project(projectId: string) {
		const project = this.db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (!project) throw new Error("Project not found");
		return project;
	}
	get(projectId: string): TaskProfileSnapshot {
		this.project(projectId);
		const record = this.db
			.select()
			.from(taskProfiles)
			.where(eq(taskProfiles.projectId, projectId))
			.get();
		return record
			? {
					revision: record.revision,
					config: taskProfileSchema.parse(record.config),
				}
			: { revision: 0, config: taskProfileSchema.parse({}) };
	}
	save(
		projectId: string,
		expectedRevision: number,
		value: TaskProfile,
	): TaskProfileSnapshot {
		const config = taskProfileSchema.parse(value);
		return this.db.transaction(() => {
			const current = this.get(projectId);
			if (current.revision !== expectedRevision)
				throw new Error("Project task profile changed; reload before saving");
			const revision = current.revision + 1;
			this.db
				.insert(taskProfiles)
				.values({ projectId, revision, config, updatedAt: Date.now() })
				.onConflictDoUpdate({
					target: taskProfiles.projectId,
					set: { revision, config, updatedAt: Date.now() },
				})
				.run();
			return { revision, config };
		});
	}
	async discover(projectId: string) {
		const project = this.project(projectId);
		const file = join(project.repoPath, "package.json");
		let data: unknown;
		try {
			if ((await stat(file)).size > 512 * 1024)
				throw new Error("package.json exceeds discovery size limit");
			data = JSON.parse(await readFile(file, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT")
				return {
					source: "package.json",
					suggestions: [],
					note: "No package.json found; add project-specific checks manually",
				};
			throw error;
		}
		if (!data || typeof data !== "object")
			throw new Error("Invalid package.json");
		const manifest = data as {
			scripts?: Record<string, unknown>;
			packageManager?: unknown;
		};
		const manager =
			typeof manifest.packageManager === "string"
				? manifest.packageManager.split("@")[0]
				: "bun";
		const executable = ["bun", "npm", "pnpm", "yarn"].includes(manager ?? "")
			? manager
			: "bun";
		const suggestions = Object.entries(manifest.scripts ?? {})
			.filter(
				([name, command]) =>
					/^(?:typecheck|check:types|lint|test(?::(?:unit|integration|e2e))?)$/.test(
						name,
					) && typeof command === "string",
			)
			.map(([name, command]) => ({
				id: name.replace(/[^a-zA-Z0-9_-]/g, "-"),
				name,
				command: `${executable} run '${name}'`,
				timeoutMs: 120_000,
				paths: [] as string[],
				script: command as string,
			}));
		return {
			source: "package.json",
			suggestions,
			note: "Suggestions are not executed or approved automatically. Inspect commands and lifecycle scripts before saving; they may have side effects.",
		};
	}
}
