import { homedir } from "node:os";
import path from "node:path";

export function globalSkillsDir(
	environment: NodeJS.ProcessEnv = process.env,
): string {
	const explicit = environment.SUPERSET_GLOBAL_SKILLS_DIR?.trim();
	if (explicit) return explicit;
	return path.join(homedir(), ".agents", "skills");
}
