import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Removes artifacts produced by the retired bundled CLI build. */
export function removeBundledCliOutput(distDir: string): void {
	const binDir = join(distDir, "resources", "bin");
	if (existsSync(binDir)) rmSync(binDir, { recursive: true, force: true });
}
