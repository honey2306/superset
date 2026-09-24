import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
	formatSkillsForPrompt,
	loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import { parseGlobalSkill } from "../global-skills/global-skill-store";

const skillDirectory = resolve(
	import.meta.dir,
	"../../../../.agents/skills/verify-behavior-change",
);
const filePath = join(skillDirectory, "SKILL.md");
const skillContent = readFileSync(filePath, "utf8");

/** Exercise the installed Pi loader, not a copy of its discovery implementation.
 * A separate process isolates HOME/config/trust from the user and other tests. */
function discoverWithNativeLoader(trusted: boolean, customGlobal = false) {
	const temporary = mkdtempSync(join(tmpdir(), "superset-task-skill-"));
	const repository = join(temporary, "project");
	const cwd = join(repository, "packages", "sample");
	const home = join(temporary, "home");
	const agentDir = join(home, ".pi", "agent");
	try {
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		// The loader discovers .agents ancestors only up to this Git boundary.
		mkdirSync(join(repository, ".git"));
		cpSync(
			skillDirectory,
			join(repository, ".agents", "skills", "verify-behavior-change"),
			{ recursive: true },
		);
		const globalFile = join(
			home,
			".agents",
			"skills",
			"test-global-reference",
			"SKILL.md",
		);
		mkdirSync(dirname(globalFile), { recursive: true });
		writeFileSync(
			globalFile,
			"---\nname: test-global-reference\ndescription: Synthetic global skill for loader isolation.\n---\n\nGLOBAL_BODY_NOT_IN_PROMPT\n",
		);
		const customDirectory = join(temporary, "host-global-skills");
		if (customGlobal) {
			const customFile = join(customDirectory, "custom-host-skill", "SKILL.md");
			mkdirSync(dirname(customFile), { recursive: true });
			writeFileSync(
				customFile,
				"---\nname: custom-host-skill\ndescription: Custom resource metadata.\n---\n\nCUSTOM_BODY_NOT_IN_PROMPT\n",
			);
		}
		const sdk = Bun.resolveSync(
			"@earendil-works/pi-coding-agent",
			import.meta.dir,
		);
		const source = `
			import {DefaultResourceLoader, SettingsManager, formatSkillsForPrompt} from ${JSON.stringify(sdk)};
			import {piAdditionalSkillPaths} from ${JSON.stringify(resolve(import.meta.dir, "../runtime/acp-sessions/pi-skill-resources.ts"))};
			const settings = SettingsManager.inMemory();
			settings.setProjectTrusted(${trusted});
			const loader = new DefaultResourceLoader({
				cwd: ${JSON.stringify(cwd)}, agentDir: ${JSON.stringify(agentDir)},
				settingsManager: settings, additionalSkillPaths:piAdditionalSkillPaths(), noExtensions: true, noPromptTemplates: true,
				noThemes: true, noContextFiles: true,
			});
			await loader.reload();
			const {skills, diagnostics} = loader.getSkills();
			console.log(JSON.stringify({names: skills.map(s => s.name), index: formatSkillsForPrompt(skills), diagnostics}));
		`;
		const env = { ...process.env };
		for (const key of Object.keys(env)) {
			if (
				/^(PI_|SUPERSET_)|TOKEN|SECRET|API_KEY|AUTH|PROXY|CREDENTIAL/i.test(key)
			)
				delete env[key];
		}
		if (customGlobal) env.SUPERSET_GLOBAL_SKILLS_DIR = customDirectory;
		Object.assign(env, {
			HOME: home,
			USERPROFILE: home,
			PI_CODING_AGENT_DIR: agentDir,
			PI_OFFLINE: "1",
			XDG_CONFIG_HOME: join(home, "config"),
			XDG_CACHE_HOME: join(home, "cache"),
		});
		return JSON.parse(
			execFileSync(process.execPath, ["--eval", source], {
				cwd,
				env,
				encoding: "utf8",
				timeout: 15_000,
				maxBuffer: 128 * 1024,
			}),
		) as {
			names: string[];
			index: string;
			diagnostics: Array<{ message: string }>;
		};
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}

describe("on-demand Task skill boundary", () => {
	test("the project skill is readable by the existing skill format and Pi", () => {
		const parsed = parseGlobalSkill(skillContent, filePath);
		expect(parsed.name).toBe("verify-behavior-change");
		expect(parsed.description).toContain("trivial copy-only edits");
		const result = loadSkillsFromDir({ dir: skillDirectory, source: "test" });
		expect(result.skills.map((skill) => skill.name)).toEqual([
			"verify-behavior-change",
		]);
		expect(result.diagnostics).toHaveLength(0);
	});

	test("initial context contains metadata only, not the method or project command list", () => {
		const { skills } = loadSkillsFromDir({
			dir: skillDirectory,
			source: "test",
		});
		const prompt = formatSkillsForPrompt(skills);
		expect(prompt).toContain("<name>verify-behavior-change</name>");
		expect(prompt).toContain("SKILL.md</location>");
		expect(prompt).not.toContain("## Establish what must work");
		expect(prompt).not.toContain("bun run --cwd packages/host-service");
		expect(prompt.length).toBeLessThan(1_500);
	});

	test("referenced project details exist and are not discovered as separate always-on skills", () => {
		const reference = join(skillDirectory, "references", "superset.md");
		expect(skillContent).toContain("references/superset.md");
		expect(readFileSync(reference, "utf8")).toContain(
			"not a mandatory sequence",
		);
		const { skills } = loadSkillsFromDir({
			dir: skillDirectory,
			source: "test",
		});
		expect(skills).toHaveLength(1);
		expect(skillContent).toContain("the Host decides acceptance");
		expect(skillContent).toContain("Do not automatically save memories");
	});

	test("installed native loader finds a trusted project's ancestor skill and global metadata", () => {
		const result = discoverWithNativeLoader(true);
		expect(result.names.sort()).toEqual([
			"test-global-reference",
			"verify-behavior-change",
		]);
		expect(result.index).not.toContain("GLOBAL_BODY_NOT_IN_PROMPT");
		expect(result.index).not.toContain("## Establish what must work");
		expect(result.diagnostics).toHaveLength(0);
	});

	test("project trust is not bypassed to force a skill into every Task", () => {
		const result = discoverWithNativeLoader(false);
		expect(result.names).toEqual(["test-global-reference"]);
		expect(result.index).not.toContain("verify-behavior-change");
		expect(result.diagnostics).toHaveLength(0);
	});
	test("configured Host-global directory reaches the actual SDK metadata index without forcing project trust", () => {
		const result = discoverWithNativeLoader(false, true);
		expect(result.names.sort()).toEqual([
			"custom-host-skill",
			"test-global-reference",
		]);
		expect(result.index).not.toContain("CUSTOM_BODY_NOT_IN_PROMPT");
		expect(result.index).not.toContain("verify-behavior-change");
	});
});
