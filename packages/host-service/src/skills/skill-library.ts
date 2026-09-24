import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	copySkillSchema,
	type SkillDetail,
	type SkillScope,
	type SkillSummary,
	saveSkillSchema,
	skillNameSchema,
	skillScopeSchema,
} from "@superset/shared/skills";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import {
	globalSkillsDir,
	parseGlobalSkill,
	parseSkillDocument,
	renderSkillDocument,
} from "../global-skills/global-skill-store";

const MAX_DOCUMENT = 256 * 1024;
const MAX_BUNDLE = 16 * 1024 * 1024;
const MAX_FILES = 512;
const digest = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");
interface BundleFile {
	path: string;
	data: Buffer;
	mode: number;
}
interface Bundle {
	directory: string;
	revision: string;
	files: BundleFile[];
	detail: SkillDetail;
}
export class SkillConflictError extends Error {}

/** Filesystem management only. Pi remains the discovery/execution implementation.
 * Never execute scripts on import, create a Task, or change project trust here. */
export class SkillLibrary {
	constructor(
		private readonly db: HostDb,
		private readonly globalDirectory = globalSkillsDir(),
	) {}
	private root(input: SkillScope): string {
		const scope = skillScopeSchema.parse(input);
		let root: string;
		if (scope.kind === "global") {
			const requested = path.resolve(this.globalDirectory);
			let ancestor = path.dirname(requested);
			while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor)
				ancestor = path.dirname(ancestor);
			root = path.join(
				realpathSync(ancestor),
				path.relative(ancestor, requested),
			);
		} else {
			const project = this.db
				.select()
				.from(projects)
				.where(eq(projects.id, scope.projectId))
				.get();
			if (!project) throw new Error("Project not found");
			// Canonicalize the registered repository, never accept a caller-provided root.
			root = path.join(realpathSync(project.repoPath), ".agents", "skills");
		}
		this.assertPath(root);
		return root;
	}
	private assertPath(file: string) {
		let current = path.parse(path.resolve(file)).root;
		for (const part of path
			.resolve(file)
			.slice(current.length)
			.split(path.sep)
			.filter(Boolean)) {
			current = path.join(current, part);
			try {
				if (lstatSync(current).isSymbolicLink())
					throw new Error(
						`Symbolic skill paths are read-only in this editor: ${current}`,
					);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
				throw error;
			}
		}
	}
	private summary(filePath: string): SkillSummary {
		this.assertPath(filePath);
		if (lstatSync(filePath).size > MAX_DOCUMENT)
			throw new Error("SKILL.md exceeds the editor size limit");
		const content = readFileSync(filePath, "utf8");
		const { name, description } = parseGlobalSkill(content, filePath);
		if (name !== path.basename(path.dirname(filePath)))
			throw new Error("Skill name must match its directory in this editor");
		const manual =
			parseSkillDocument(content, filePath).fields.get(
				"disable-model-invocation",
			) === "true";
		return {
			name,
			description,
			filePath,
			invocation: manual ? "manual" : "auto",
		};
	}
	list(scope: SkillScope) {
		const directory = this.root(scope);
		const skills: SkillSummary[] = [],
			diagnostics: Array<{ path: string; message: string }> = [];
		if (existsSync(directory))
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				if (entry.name.startsWith(".")) continue;
				if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
				const file = path.join(directory, entry.name, "SKILL.md");
				try {
					skills.push(this.summary(file));
				} catch (error) {
					diagnostics.push({
						path: file,
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		return {
			directory,
			scope,
			skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
			diagnostics,
		};
	}
	private bundle(scope: SkillScope, name: string): Bundle {
		const root = this.root(scope),
			directory = path.join(root, skillNameSchema.parse(name));
		this.assertPath(directory);
		const summary = this.summary(path.join(directory, "SKILL.md"));
		let bytes = 0;
		const files: BundleFile[] = [];
		const walk = (dir: string, depth: number) => {
			if (depth > 12)
				throw new Error("Skill package nesting exceeds the editor limit");
			for (const entry of readdirSync(dir, { withFileTypes: true }).sort(
				(a, b) => a.name.localeCompare(b.name),
			)) {
				if (entry.name.startsWith(".superset-skill-")) continue;
				const absolute = path.join(dir, entry.name);
				if (entry.name === ".git" || entry.isSymbolicLink())
					throw new Error(
						`Skill packages containing .git or symbolic links cannot be managed/copied: ${entry.name}`,
					);
				if (entry.isDirectory()) {
					walk(absolute, depth + 1);
					continue;
				}
				if (!entry.isFile())
					throw new Error("Unsupported file type in skill package");
				const info = lstatSync(absolute);
				bytes += info.size;
				if (bytes > MAX_BUNDLE || files.length >= MAX_FILES)
					throw new Error(
						"Skill package exceeds 16 MiB / 512 files; manage it with your editor",
					);
				files.push({
					path: path.relative(directory, absolute).split(path.sep).join("/"),
					data: readFileSync(absolute),
					mode: info.mode & 0o777,
				});
			}
		};
		walk(directory, 0);
		const hash = createHash("sha256");
		for (const file of files)
			hash.update(JSON.stringify([file.path, file.mode, digest(file.data)]));
		const revision = hash.digest("hex");
		const main = files.find((file) => file.path === "SKILL.md");
		if (!main) throw new Error("SKILL.md disappeared while reading");
		// Use the same captured bytes for content/revision; don't mix two read versions.
		const parsed = parseGlobalSkill(
			main.data.toString("utf8"),
			summary.filePath,
		);
		return {
			directory,
			revision,
			files,
			detail: {
				...summary,
				description: parsed.description,
				invocation:
					parseSkillDocument(
						main.data.toString("utf8"),
						summary.filePath,
					).fields.get("disable-model-invocation") === "true"
						? "manual"
						: "auto",
				instructions: parsed.instructions,
				revision,
				files: files.map((file) => ({
					path: file.path,
					size: file.data.length,
					executable: Boolean(file.mode & 0o111),
				})),
			},
		};
	}
	get(scope: SkillScope, name: string): SkillDetail {
		return this.bundle(scope, name).detail;
	}
	readFile(scope: SkillScope, name: string, relative: string) {
		const bundle = this.bundle(scope, name);
		const file = bundle.files.find((item) => item.path === relative);
		if (!file) throw new Error("Skill package file not found");
		if (file.data.length > MAX_DOCUMENT)
			return {
				path: relative,
				content: null,
				reason: "File exceeds text preview limit",
				revision: bundle.revision,
			};
		const text = file.data.toString("utf8");
		if (file.data.includes(0) || !Buffer.from(text, "utf8").equals(file.data))
			return {
				path: relative,
				content: null,
				reason: "Binary file; preserved when copying the package",
				revision: bundle.revision,
			};
		return {
			path: relative,
			content: text,
			reason: null,
			revision: bundle.revision,
		};
	}
	private lock<T>(root: string, action: () => T): T {
		this.assertPath(root);
		mkdirSync(root, { recursive: true, mode: 0o700 });
		const lock = path.join(root, ".superset-skills.lock");
		let fd: number;
		try {
			fd = openSync(lock, "wx", 0o600);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST")
				throw new SkillConflictError(
					"Another skill update is in progress. Retry after it finishes; an abandoned lock must be inspected, not silently removed.",
				);
			throw error;
		}
		try {
			return action();
		} finally {
			closeSync(fd);
			rmSync(lock, { force: true });
		}
	}
	private assertRevision(bundle: Bundle, expected: string) {
		if (bundle.revision !== expected)
			throw new SkillConflictError(
				"Skill or companion files changed externally. Refresh and review before saving, copying or deleting.",
			);
	}
	save(value: unknown): SkillDetail {
		const input = saveSkillSchema.parse(value),
			root = this.root(input.scope);
		return this.lock(root, () => {
			const target = path.join(root, input.skill.name);
			let previous: Bundle | undefined;
			if (input.previousName) {
				previous = this.bundle(input.scope, input.previousName);
				if (!input.expectedRevision)
					throw new SkillConflictError(
						"Editing requires the loaded package revision",
					);
				this.assertRevision(previous, input.expectedRevision);
			} else if (input.expectedRevision !== null)
				throw new SkillConflictError(
					"Creating requires a null expected revision",
				);
			if ((!previous || previous.directory !== target) && existsSync(target))
				throw new SkillConflictError(
					"A skill with this name already exists; it was not overwritten",
				);
			const original = previous?.files.find((file) => file.path === "SKILL.md");
			const { invocation, ...fields } = input.skill;
			const content = renderSkillDocument(
				fields,
				original?.data.toString("utf8"),
				invocation,
			);
			if (previous && previous.directory !== target)
				renameSync(previous.directory, target);
			else if (!previous) mkdirSync(target, { mode: 0o700 });
			const temporary = path.join(
				target,
				`.superset-skill-${randomUUID()}.tmp`,
			);
			try {
				writeFileSync(temporary, content, {
					mode: original?.mode ?? 0o600,
					flag: "wx",
				});
				renameSync(temporary, path.join(target, "SKILL.md"));
			} catch (error) {
				rmSync(temporary, { force: true });
				if (previous && previous.directory !== target)
					renameSync(target, previous.directory);
				else if (!previous) rmSync(target, { recursive: true, force: true });
				throw error;
			}
			return this.get(input.scope, input.skill.name);
		});
	}
	remove(scope: SkillScope, name: string, expectedRevision: string) {
		const root = this.root(scope);
		return this.lock(root, () => {
			const bundle = this.bundle(scope, name);
			this.assertRevision(bundle, expectedRevision);
			rmSync(bundle.directory, { recursive: true });
			return { removed: true };
		});
	}
	copy(value: unknown): SkillDetail {
		const input = copySkillSchema.parse(value),
			bundle = this.bundle(input.source.scope, input.source.name);
		this.assertRevision(bundle, input.expectedRevision);
		const root = this.root(input.target.scope);
		return this.lock(root, () => {
			const destination = path.join(root, input.target.name);
			if (existsSync(destination))
				throw new SkillConflictError(
					"Destination skill already exists; no files were overwritten",
				);
			const temporary = path.join(root, `.superset-skill-${randomUUID()}`);
			mkdirSync(temporary, { mode: 0o700 });
			try {
				for (const file of bundle.files) {
					const dest = path.join(temporary, file.path);
					mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
					const data =
						file.path === "SKILL.md"
							? renderSkillDocument(
									{
										name: input.target.name,
										description: bundle.detail.description,
										instructions: bundle.detail.instructions,
									},
									file.data.toString("utf8"),
								)
							: file.data;
					writeFileSync(dest, data, { mode: file.mode, flag: "wx" });
				}
				// Recheck source before publishing the copied package; never merge destinations.
				this.assertRevision(
					this.bundle(input.source.scope, input.source.name),
					input.expectedRevision,
				);
				renameSync(temporary, destination);
			} catch (error) {
				rmSync(temporary, { recursive: true, force: true });
				throw error;
			}
			return this.get(input.target.scope, input.target.name);
		});
	}
}
