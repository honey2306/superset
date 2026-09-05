/**
 * Build-channel and host-scope identity, with no Node built-in imports.
 *
 * Deliberately dependency-free so the desktop renderer (a browser bundle) can
 * import these constants. Anything needing `node:fs`/`node:os`/`node:path`
 * belongs in `./host-paths` instead — re-exporting a node-importing module
 * from `apps/desktop/src/shared/constants.ts` pulls those builtins into the
 * renderer bundle and breaks the dev server.
 */

export const BUILD_CHANNELS = ["stable", "canary", "personal"] as const;
export type BuildChannel = (typeof BUILD_CHANNELS)[number];

export const SUPERSET_HOME_DIR_ENV = "SUPERSET_HOME_DIR";
export const SUPERSET_WORKSPACE_NAME_ENV = "SUPERSET_WORKSPACE_NAME";
export const SUPERSET_BUILD_CHANNEL_ENV = "SUPERSET_BUILD_CHANNEL";

/** Default workspace name; treated as "no workspace suffix". */
const DEFAULT_WORKSPACE_NAME = "superset";

export const BASE_SUPERSET_DIR_NAME = ".superset";
export const CANARY_SUPERSET_DIR_NAME = ".superset-canary";
export const PERSONAL_SUPERSET_DIR_NAME = ".superset-personal";

/**
 * Stable scope for the single local desktop runtime. Keep this value stable so
 * existing host.db data created by the previous local-session shim remains
 * discoverable after cloud identity is removed.
 */
export const LOCAL_HOST_SCOPE_ID = "1887f807-99db-49c0-9568-fc085a2fd36a";

function isBuildChannel(value: string | undefined): value is BuildChannel {
	return (
		value !== undefined && (BUILD_CHANNELS as readonly string[]).includes(value)
	);
}

export function resolveBuildChannel(
	env: NodeJS.ProcessEnv = process.env,
): BuildChannel {
	const raw = env[SUPERSET_BUILD_CHANNEL_ENV];
	return isBuildChannel(raw) ? raw : "stable";
}

/**
 * Normalized workspace name used to isolate dev worktrees, or `undefined` for
 * the default workspace (which owns the unsuffixed directory).
 */
export function resolveWorkspaceName(
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const raw = env[SUPERSET_WORKSPACE_NAME_ENV] ?? DEFAULT_WORKSPACE_NAME;
	if (raw === DEFAULT_WORKSPACE_NAME) return undefined;
	const normalized = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.slice(0, 32);
	return normalized || undefined;
}

/**
 * Home directory name for a build channel. Canary and personal builds must
 * never share mutable runtime data with the stable app; dev worktrees keep
 * their workspace-specific directory.
 */
export function getSupersetDirName(
	buildChannel: BuildChannel = resolveBuildChannel(),
	env: NodeJS.ProcessEnv = process.env,
): string {
	if (buildChannel === "personal") return PERSONAL_SUPERSET_DIR_NAME;
	if (buildChannel === "canary") return CANARY_SUPERSET_DIR_NAME;
	const workspace = resolveWorkspaceName(env);
	return workspace
		? `${BASE_SUPERSET_DIR_NAME}-${workspace}`
		: BASE_SUPERSET_DIR_NAME;
}

/**
 * Contents of the manifest the host-service writes on startup. The CLI reads
 * `endpoint` and `authToken` from it to reach the running service.
 */
export interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

export function isHostServiceManifest(
	value: unknown,
): value is HostServiceManifest {
	if (typeof value !== "object" || value === null) return false;
	const data = value as Record<string, unknown>;
	return (
		typeof data.pid === "number" &&
		typeof data.endpoint === "string" &&
		typeof data.authToken === "string" &&
		typeof data.startedAt === "number" &&
		typeof data.organizationId === "string"
	);
}
