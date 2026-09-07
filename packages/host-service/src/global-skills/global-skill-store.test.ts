import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	parseGlobalSkill,
	readGlobalSkills,
	removeGlobalSkill,
	upsertGlobalSkill,
} from "./global-skill-store";

function temporarySkillsDir(): string {
	return mkdtempSync(path.join(tmpdir(), "superset-global-skills-"));
}

describe("global skill store", () => {
	test("writes standard SKILL.md frontmatter and reads it back", () => {
		const skillsDir = temporarySkillsDir();
		const saved = upsertGlobalSkill(
			{
				name: "review-pr",
				description: "Review a pull request safely.",
				instructions: "# Review\n\nInspect the diff before commenting.",
			},
			{ skillsDir },
		);

		expect(saved.filePath).toBe(path.join(skillsDir, "review-pr", "SKILL.md"));
		expect(readFileSync(saved.filePath, "utf8")).toContain('name: "review-pr"');
		expect(readGlobalSkills(skillsDir)).toEqual([saved]);
	});

	test("renames a skill without leaving its previous directory", () => {
		const skillsDir = temporarySkillsDir();
		upsertGlobalSkill(
			{ name: "old-name", description: "Old", instructions: "Old body" },
			{ skillsDir },
		);
		const renamed = upsertGlobalSkill(
			{ name: "new-name", description: "New", instructions: "New body" },
			{ previousName: "old-name", skillsDir },
		);

		expect(readGlobalSkills(skillsDir)).toEqual([renamed]);
		expect(removeGlobalSkill("new-name", skillsDir)).toBe(true);
		expect(removeGlobalSkill("new-name", skillsDir)).toBe(false);
	});

	test("preserves extra frontmatter and supports folded descriptions", () => {
		const skillsDir = temporarySkillsDir();
		const skillDirectory = path.join(skillsDir, "official-skill");
		const skillPath = path.join(skillDirectory, "SKILL.md");
		mkdirSync(skillDirectory, { recursive: true });
		writeFileSync(
			skillPath,
			`---\nname: official-skill\ndescription: >-\n  Use this skill for official\n  Agent Skills workflows.\nlicense: Apache-2.0\nmetadata:\n  author: superset\n---\n\n# Original\n`,
		);

		expect(readGlobalSkills(skillsDir)[0]?.description).toBe(
			"Use this skill for official Agent Skills workflows.",
		);
		upsertGlobalSkill(
			{
				name: "official-skill",
				description: "Updated description",
				instructions: "# Updated",
			},
			{ previousName: "official-skill", skillsDir },
		);
		const saved = readFileSync(skillPath, "utf8");
		expect(saved).toContain("license: Apache-2.0");
		expect(saved).toContain("metadata:\n  author: superset");
		expect(saved).toContain('description: "Updated description"');
	});

	test("skips invalid folders and rejects malformed content", () => {
		const skillsDir = temporarySkillsDir();
		const invalidPath = path.join(skillsDir, "invalid", "SKILL.md");
		mkdirSync(path.dirname(invalidPath), { recursive: true });
		upsertGlobalSkill(
			{ name: "valid", description: "Valid", instructions: "Do it." },
			{ skillsDir },
		);
		writeFileSync(invalidPath, "not frontmatter", {
			encoding: "utf8",
			flag: "wx",
		});
		expect(readGlobalSkills(skillsDir).map((skill) => skill.name)).toEqual([
			"valid",
		]);
		expect(() => parseGlobalSkill("bad", invalidPath)).toThrow(
			"Invalid skill frontmatter",
		);
	});
});
