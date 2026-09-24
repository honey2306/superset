import { globalSkillsDir } from "./paths";

export { globalSkillsDir } from "./paths";

import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";

const SKILL_FILE_NAME = "SKILL.md";
const skillNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9][a-z0-9-]*$/,
		"Use lowercase letters, numbers, and hyphens.",
	);

export const globalSkillInputSchema = z
	.object({
		name: skillNameSchema,
		description: z.string().trim().min(1).max(2_000),
		instructions: z.string().trim().min(1).max(100_000),
	})
	.strict();

export type GlobalSkillInput = z.infer<typeof globalSkillInputSchema>;
export interface GlobalSkill extends GlobalSkillInput {
	filePath: string;
}

function yamlScalar(value: string): string {
	return JSON.stringify(value);
}

function parseFrontmatterValue(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith('"')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === "string") return parsed;
		} catch {
			// Fall through to accepting a plain scalar.
		}
	}
	return trimmed.replace(/^['"]|['"]$/g, "");
}

interface ParsedSkillDocument {
	fields: Map<string, string>;
	frontmatterLines: string[];
	instructions: string;
}

export function parseSkillDocument(
	content: string,
	filePath: string,
): ParsedSkillDocument {
	const normalized = content.replace(/\r\n/g, "\n");
	const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) throw new Error(`Invalid skill frontmatter in ${filePath}`);
	const frontmatter = match[1] ?? "";
	const frontmatterLines = frontmatter.split("\n");
	const fields = new Map<string, string>();
	for (let index = 0; index < frontmatterLines.length; index += 1) {
		const line = frontmatterLines[index] ?? "";
		const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
		if (!field?.[1]) continue;
		const rawValue = field[2] ?? "";
		if (
			rawValue === ">" ||
			rawValue === "|" ||
			rawValue === ">-" ||
			rawValue === "|-"
		) {
			const continuation: string[] = [];
			while (/^\s+/.test(frontmatterLines[index + 1] ?? "")) {
				index += 1;
				continuation.push((frontmatterLines[index] ?? "").trim());
			}
			fields.set(
				field[1],
				rawValue.startsWith(">")
					? continuation.join(" ")
					: continuation.join("\n"),
			);
			continue;
		}
		fields.set(field[1], parseFrontmatterValue(rawValue));
	}
	return {
		fields,
		frontmatterLines,
		instructions: (match[2] ?? "").trim(),
	};
}

function replaceFrontmatterField(
	lines: readonly string[],
	fieldName: string,
	value: string,
): string[] {
	const nextLines = [...lines];
	const fieldPattern = new RegExp(`^${fieldName}:s*(.*)$`);
	const startIndex = nextLines.findIndex((line) => fieldPattern.test(line));
	const replacement = `${fieldName}: ${yamlScalar(value)}`;
	if (startIndex < 0) return [replacement, ...nextLines];
	let endIndex = startIndex + 1;
	const rawValue = nextLines[startIndex]?.match(fieldPattern)?.[1]?.trim();
	if (
		rawValue === ">" ||
		rawValue === "|" ||
		rawValue === ">-" ||
		rawValue === "|-"
	) {
		while (/^\s+/.test(nextLines[endIndex] ?? "")) endIndex += 1;
	}
	nextLines.splice(startIndex, endIndex - startIndex, replacement);
	return nextLines;
}

function skillFilePath(name: string, skillsDir = globalSkillsDir()): string {
	return path.join(skillsDir, skillNameSchema.parse(name), SKILL_FILE_NAME);
}

export function parseGlobalSkill(
	content: string,
	filePath: string,
): GlobalSkill {
	const document = parseSkillDocument(content, filePath);
	return {
		...globalSkillInputSchema.parse({
			name: document.fields.get("name"),
			description: document.fields.get("description"),
			instructions: document.instructions,
		}),
		filePath,
	};
}

/** One serializer for the legacy global editor and the scoped skill library.
 * Unknown frontmatter is retained. Invocation is a discovery preference, not a
 * permission to run tools or a promise that the model has loaded this skill. */
export function renderSkillDocument(
	input: GlobalSkillInput,
	existing?: string,
	invocation?: "auto" | "manual",
): string {
	const skill = globalSkillInputSchema.parse(input);
	let lines = existing
		? parseSkillDocument(existing, "SKILL.md").frontmatterLines
		: [];
	lines = replaceFrontmatterField(lines, "name", skill.name);
	lines = replaceFrontmatterField(lines, "description", skill.description);
	if (invocation !== undefined) {
		lines = lines.filter(
			(line) => !line.startsWith("disable-model-invocation:"),
		);
		lines.push(`disable-model-invocation: ${invocation === "manual"}`);
	}
	return `---\n${lines.join("\n")}\n---\n\n${skill.instructions.trim()}\n`;
}

export function readGlobalSkills(skillsDir = globalSkillsDir()): GlobalSkill[] {
	if (!existsSync(skillsDir)) return [];
	const skills: GlobalSkill[] = [];
	for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const filePath = path.join(skillsDir, entry.name, SKILL_FILE_NAME);
		if (!existsSync(filePath)) continue;
		try {
			const skill = parseGlobalSkill(readFileSync(filePath, "utf8"), filePath);
			if (skill.name === entry.name) skills.push(skill);
		} catch (error) {
			console.warn(
				`[global-skills] skipping invalid skill at ${filePath}`,
				error,
			);
		}
	}
	return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export function upsertGlobalSkill(
	input: GlobalSkillInput,
	options: { previousName?: string; skillsDir?: string } = {},
): GlobalSkill {
	const skill = globalSkillInputSchema.parse(input);
	const skillsDir = options.skillsDir ?? globalSkillsDir();
	const targetFile = skillFilePath(skill.name, skillsDir);
	const targetDir = path.dirname(targetFile);
	if (
		options.previousName &&
		options.previousName !== skill.name &&
		existsSync(targetDir)
	) {
		throw new Error(`A global skill named '${skill.name}' already exists.`);
	}
	const renamed = Boolean(
		options.previousName && options.previousName !== skill.name,
	);
	const previousDir = options.previousName
		? path.dirname(skillFilePath(options.previousName, skillsDir))
		: targetDir;
	if (renamed && !existsSync(previousDir))
		throw new Error("The skill to rename no longer exists");
	const temporaryPath = `${targetFile}.${randomUUID()}.tmp`;
	const existingPath = options.previousName
		? skillFilePath(options.previousName, skillsDir)
		: targetFile;
	const existingContent = existsSync(existingPath)
		? readFileSync(existingPath, "utf8")
		: undefined;
	const content = renderSkillDocument(skill, existingContent);
	if (renamed) renameSync(previousDir, targetDir);
	else mkdirSync(targetDir, { recursive: true, mode: 0o700 });
	try {
		writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
		renameSync(temporaryPath, targetFile);
	} catch (error) {
		if (renamed) renameSync(targetDir, previousDir);
		throw error;
	} finally {
		rmSync(temporaryPath, { force: true });
		if (renamed)
			rmSync(path.join(previousDir, path.basename(temporaryPath)), {
				force: true,
			});
	}
	return { ...skill, filePath: targetFile };
}

export function removeGlobalSkill(
	name: string,
	skillsDir = globalSkillsDir(),
): boolean {
	const directory = path.dirname(skillFilePath(name, skillsDir));
	if (!existsSync(directory)) return false;
	rmSync(directory, { recursive: true, force: true });
	return true;
}
