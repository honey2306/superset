import { existsSync } from "node:fs";
import path from "node:path";
import { globalSkillsDir } from "../../global-skills/paths";

/** Defaults remain native Pi discovery. A configured Host-global directory is
 * an explicit additional resource, not a reason to load every skill body. */
export function piAdditionalSkillPaths(
	environment: NodeJS.ProcessEnv = process.env,
): string[] {
	if (!environment.SUPERSET_GLOBAL_SKILLS_DIR?.trim()) return [];
	const directory = path.resolve(globalSkillsDir(environment));
	return existsSync(directory) ? [directory] : [];
}
