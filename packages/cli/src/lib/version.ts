/**
 * CLI version.
 *
 * Read from package.json rather than duplicated as a literal: `packages/cli`
 * is in UNIFIED_PACKAGES, so the release script rewrites that file and this
 * constant follows automatically instead of drifting behind it.
 */

import packageJson from "../../package.json" with { type: "json" };

export const CLI_VERSION: string = packageJson.version;
