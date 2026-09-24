import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	formatSkillsForPrompt,
	loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import type { SkillScope } from "@superset/shared/skills";
import { upsertGlobalSkill } from "../global-skills";
import { taskFixture } from "../tasks/test-fixture";
import { appRouter } from "../trpc/router/router";
import { SkillLibrary } from "./skill-library";

const fixtures: Array<Awaited<ReturnType<typeof taskFixture>>> = [];
afterEach(async () => {
	for (const item of fixtures.splice(0)) await item.close();
});
async function fixture() {
	const f = await taskFixture();
	fixtures.push(f);
	const global = join(f.directory, "global-skills"),
		library = new SkillLibrary(f.db, global);
	const scope: SkillScope = { kind: "project", projectId: f.projectId };
	return { ...f, library, global, scope };
}
const draft = {
	name: "verify-behavior",
	description: "Use for behavioral regressions",
	instructions: "# Method\n\nRead references/checks.md only when relevant.",
	invocation: "auto" as const,
};
function appendFiles(root: string) {
	mkdirSync(join(root, "references"), { recursive: true });
	mkdirSync(join(root, "scripts"), { recursive: true });
	writeFileSync(join(root, "references/checks.md"), "REFERENCE_NOT_IN_INDEX\n");
	writeFileSync(
		join(root, "scripts/check.sh"),
		"#!/bin/sh\necho not-executed\n",
	);
	chmodSync(join(root, "scripts/check.sh"), 0o755);
	writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 255, 17]));
}
describe("scoped file-backed skill library", () => {
	test("listing a new scope does not create directories, load bodies into responses or create tasks", async () => {
		const f = await fixture();
		const before = f.store.list().length;
		expect(f.library.list(f.scope).skills).toEqual([]);
		expect(existsSync(join(f.cwd, ".agents"))).toBe(false);
		f.library.save({ scope: f.scope, expectedRevision: null, skill: draft });
		const list = f.library.list(f.scope);
		expect(list.skills[0]?.name).toBe(draft.name);
		expect(JSON.stringify(list)).not.toContain("# Method");
		expect(f.store.list()).toHaveLength(before);
		expect(f.library.list({ kind: "global" }).skills).toHaveLength(0);
		expect(existsSync(f.global)).toBe(false);
	});
	test("save and rename keep references, executable scripts, binary assets and unknown frontmatter", async () => {
		const f = await fixture();
		const skill = f.library.save({
			scope: f.scope,
			expectedRevision: null,
			skill: draft,
		});
		const dir = join(f.cwd, ".agents/skills", draft.name);
		appendFiles(dir);
		writeFileSync(
			skill.filePath,
			readFileSync(skill.filePath, "utf8").replace(
				"---\n",
				"---\nlicense: MIT\nmetadata:\n  source: original\n",
			),
		);
		const loaded = f.library.get(f.scope, draft.name);
		const renamed = f.library.save({
			scope: f.scope,
			previousName: draft.name,
			expectedRevision: loaded.revision,
			skill: {
				...draft,
				name: "renamed-method",
				instructions: "# Updated",
				invocation: "manual",
			},
		});
		expect(renamed.files.map((file) => file.path).sort()).toEqual([
			"SKILL.md",
			"binary.bin",
			"references/checks.md",
			"scripts/check.sh",
		]);
		expect(renamed.invocation).toBe("manual");
		expect(existsSync(dir)).toBe(false);
		expect(readFileSync(renamed.filePath, "utf8")).toContain("license: MIT");
		expect(readFileSync(renamed.filePath, "utf8")).toContain(
			"source: original",
		);
		const newdir = join(f.cwd, ".agents/skills/renamed-method");
		expect(lstatSync(join(newdir, "scripts/check.sh")).mode & 0o111).toBe(
			0o111,
		);
		expect(
			formatSkillsForPrompt(
				loadSkillsFromDir({ dir: newdir, source: "test" }).skills,
			),
		).not.toContain("renamed-method");
	});
	test("companion file changes invalidate edit, delete and copy instead of losing external work", async () => {
		const f = await fixture();
		f.library.save({ scope: f.scope, expectedRevision: null, skill: draft });
		const dir = join(f.cwd, ".agents/skills", draft.name);
		appendFiles(dir);
		const original = f.library.get(f.scope, draft.name);
		writeFileSync(join(dir, "references/checks.md"), "new external reference");
		expect(() =>
			f.library.save({
				scope: f.scope,
				previousName: draft.name,
				expectedRevision: original.revision,
				skill: { ...draft, instructions: "replace" },
			}),
		).toThrow("changed externally");
		expect(() =>
			f.library.remove(f.scope, draft.name, original.revision),
		).toThrow("changed externally");
		expect(() =>
			f.library.copy({
				source: { scope: f.scope, name: draft.name },
				expectedRevision: original.revision,
				target: { scope: { kind: "global" }, name: draft.name },
			}),
		).toThrow("changed externally");
		expect(readFileSync(join(dir, "references/checks.md"), "utf8")).toBe(
			"new external reference",
		);
	});
	test("copy moves a complete snapshot, not just Markdown, and never runs bundled code", async () => {
		const f = await fixture();
		f.library.save({ scope: f.scope, expectedRevision: null, skill: draft });
		const dir = join(f.cwd, ".agents/skills", draft.name);
		appendFiles(dir);
		const original = f.library.get(f.scope, draft.name);
		const copied = f.library.copy({
			source: { scope: f.scope, name: draft.name },
			expectedRevision: original.revision,
			target: { scope: { kind: "global" }, name: "global-method" },
		});
		expect(copied.files.length).toBe(4);
		expect(copied.name).toBe("global-method");
		expect(
			f.library.readFile(
				{ kind: "global" },
				"global-method",
				"references/checks.md",
			).content,
		).toBe("REFERENCE_NOT_IN_INDEX\n");
		expect(
			f.library.readFile({ kind: "global" }, "global-method", "binary.bin")
				.content,
		).toBeNull();
		expect(readFileSync(join(f.global, "global-method/binary.bin"))).toEqual(
			Buffer.from([0, 1, 255, 17]),
		);
		expect(f.library.get(f.scope, draft.name).revision).toBe(original.revision);
	});
	test("colliding create, rename and copy never overwrite destination packages", async () => {
		const f = await fixture();
		const first = f.library.save({
			scope: f.scope,
			expectedRevision: null,
			skill: draft,
		});
		expect(() =>
			f.library.save({ scope: f.scope, expectedRevision: null, skill: draft }),
		).toThrow("already exists");
		f.library.save({
			scope: f.scope,
			expectedRevision: null,
			skill: { ...draft, name: "second" },
		});
		expect(() =>
			f.library.save({
				scope: f.scope,
				previousName: draft.name,
				expectedRevision: first.revision,
				skill: { ...draft, name: "second" },
			}),
		).toThrow("already exists");
		expect(() =>
			f.library.copy({
				source: { scope: f.scope, name: draft.name },
				expectedRevision: first.revision,
				target: { scope: f.scope, name: "second" },
			}),
		).toThrow("already exists");
		expect(f.library.get(f.scope, draft.name).revision).toBe(first.revision);
	});
	test("symbolic reference files and path traversal cannot expose or delete outside content", async () => {
		const f = await fixture();
		f.library.save({ scope: f.scope, expectedRevision: null, skill: draft });
		const dir = join(f.cwd, ".agents/skills", draft.name);
		const outside = join(f.directory, "outside.txt");
		writeFileSync(outside, "outside");
		expect(() =>
			f.library.readFile(f.scope, draft.name, "../../../../outside.txt"),
		).toThrow("not found");
		symlinkSync(outside, join(dir, "link.txt"));
		expect(() => f.library.get(f.scope, draft.name)).toThrow("symbolic links");
		expect(() => f.library.remove(f.scope, draft.name, "a".repeat(64))).toThrow(
			"symbolic links",
		);
		expect(readFileSync(outside, "utf8")).toBe("outside");
		expect(() => f.library.get(f.scope, "../bad")).toThrow();
	});
	test("invalid skill metadata is visible as a diagnostic, not executable or silently trusted", async () => {
		const f = await fixture();
		const root = join(f.cwd, ".agents/skills/broken");
		mkdirSync(root, { recursive: true });
		writeFileSync(join(root, "SKILL.md"), "not a skill");
		const list = f.library.list(f.scope);
		expect(list.skills).toHaveLength(0);
		expect(list.diagnostics).toHaveLength(1);
		expect(list.diagnostics[0]?.message).toContain("frontmatter");
		expect(() =>
			f.library.list({ kind: "project", projectId: "missing" }),
		).toThrow("Project not found");
	});
	test("whole-package deletion is revision checked and affects only the selected scope", async () => {
		const f = await fixture();
		const project = f.library.save({
			scope: f.scope,
			expectedRevision: null,
			skill: draft,
		});
		const global = f.library.save({
			scope: { kind: "global" },
			expectedRevision: null,
			skill: draft,
		});
		expect(f.library.remove(f.scope, draft.name, project.revision)).toEqual({
			removed: true,
		});
		expect(existsSync(project.filePath)).toBe(false);
		expect(existsSync(global.filePath)).toBe(true);
	});
	test("an existing mutation lock is not stolen or removed", async () => {
		const f = await fixture();
		mkdirSync(f.global);
		writeFileSync(join(f.global, ".superset-skills.lock"), "another process");
		expect(() =>
			f.library.save({
				scope: { kind: "global" },
				expectedRevision: null,
				skill: draft,
			}),
		).toThrow("in progress");
		expect(readFileSync(join(f.global, ".superset-skills.lock"), "utf8")).toBe(
			"another process",
		);
	});
	test("legacy global rename also preserves complete skill packages", async () => {
		const f = await fixture();
		upsertGlobalSkill(
			{
				name: draft.name,
				description: draft.description,
				instructions: draft.instructions,
			},
			{ skillsDir: f.global },
		);
		appendFiles(join(f.global, draft.name));
		upsertGlobalSkill(
			{
				name: "legacy-renamed",
				description: draft.description,
				instructions: draft.instructions,
			},
			{ skillsDir: f.global, previousName: draft.name },
		);
		expect(
			existsSync(join(f.global, "legacy-renamed/references/checks.md")),
		).toBe(true);
		expect(existsSync(join(f.global, draft.name))).toBe(false);
	});
	test("new skill API is authenticated and rejects phone and arbitrary directory scopes", async () => {
		const f = await fixture();
		const caller = (authKind: string, isAuthenticated: boolean) =>
			appRouter.createCaller({
				db: f.db,
				runtime: {},
				organizationId: "test",
				authKind,
				isAuthenticated,
			} as never);
		await expect(
			caller("psk", false).settings.skills.list({ scope: f.scope }),
		).rejects.toThrow("authentication");
		await expect(
			caller("phone", true).settings.skills.list({ scope: f.scope }),
		).rejects.toThrow("paired phone");
		const api = caller("psk", true);
		const skill = await api.settings.skills.save({
			scope: f.scope,
			expectedRevision: null,
			skill: draft,
		});
		expect(
			(await api.settings.skills.list({ scope: f.scope })).skills[0]?.name,
		).toBe(draft.name);
		await expect(
			api.settings.skills.save({
				scope: f.scope,
				previousName: draft.name,
				expectedRevision: "a".repeat(64),
				skill: draft,
			}),
		).rejects.toThrow("changed externally");
		expect(
			(await api.settings.skills.get({ scope: f.scope, name: draft.name }))
				.revision,
		).toBe(skill.revision);
	});
});
