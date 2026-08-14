import { resolve } from "node:path";
import { removeBundledCliOutput } from "./bundled-cli-output";

// The bundled CLI has been removed for the single-user setup. Clear old output
// so a previous build cannot be accidentally packaged again.
removeBundledCliOutput(resolve(import.meta.dir, "..", "dist"));
console.log("[bundled-cli] Removed stale bundled CLI output");
