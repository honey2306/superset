import { existsSync } from "node:fs";
import path from "node:path";

function executableOnPath(
	name: string,
	pathValue = process.env.PATH,
): string | null {
	if (!pathValue) return null;
	for (const directory of pathValue.split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue;
		const candidate = path.join(directory, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

export function resolvePeekabooExecutable(
	environment: NodeJS.ProcessEnv = process.env,
): string | null {
	const configured = environment.SUPERSET_PEEKABOO_PATH;
	if (configured) return existsSync(configured) ? configured : null;
	return executableOnPath("peekaboo", environment.PATH);
}
