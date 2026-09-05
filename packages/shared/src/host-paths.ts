/**
 * Filesystem resolution for the local host-service manifest.
 *
 * The CLI must locate the exact same `<home>/host/<scope>/manifest.json` file
 * the desktop app writes, so this logic is shared rather than duplicated — a
 * second copy would silently drift and leave the CLI unable to connect.
 *
 * This module imports Node built-ins. Anything that needs to reach the desktop
 * **renderer** (a browser bundle) must import `./host-scope` instead, which is
 * deliberately dependency-free.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	getSupersetDirName,
	type HostServiceManifest,
	isHostServiceManifest,
	LOCAL_HOST_SCOPE_ID,
	resolveBuildChannel,
	SUPERSET_HOME_DIR_ENV,
} from "./host-scope";

export {
	BASE_SUPERSET_DIR_NAME,
	BUILD_CHANNELS,
	type BuildChannel,
	CANARY_SUPERSET_DIR_NAME,
	getSupersetDirName,
	type HostServiceManifest,
	isHostServiceManifest,
	LOCAL_HOST_SCOPE_ID,
	PERSONAL_SUPERSET_DIR_NAME,
	resolveBuildChannel,
	resolveWorkspaceName,
	SUPERSET_BUILD_CHANNEL_ENV,
	SUPERSET_HOME_DIR_ENV,
	SUPERSET_WORKSPACE_NAME_ENV,
} from "./host-scope";

/**
 * Absolute Superset home directory. An explicit `SUPERSET_HOME_DIR` always
 * wins so the desktop app can hand a resolved path to child processes.
 */
export function resolveSupersetHomeDir(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const explicit = env[SUPERSET_HOME_DIR_ENV];
	if (explicit) return explicit;
	return join(homedir(), getSupersetDirName(resolveBuildChannel(env), env));
}

export function hostScopeDir(
	scopeId: string = LOCAL_HOST_SCOPE_ID,
	env: NodeJS.ProcessEnv = process.env,
): string {
	return join(resolveSupersetHomeDir(env), "host", scopeId);
}

export function hostManifestPath(
	scopeId: string = LOCAL_HOST_SCOPE_ID,
	env: NodeJS.ProcessEnv = process.env,
): string {
	return join(hostScopeDir(scopeId, env), "manifest.json");
}

/** Read and validate a manifest, returning null when absent or malformed. */
export function readHostManifest(
	scopeId: string = LOCAL_HOST_SCOPE_ID,
	env: NodeJS.ProcessEnv = process.env,
): HostServiceManifest | null {
	const filePath = hostManifestPath(scopeId, env);
	if (!existsSync(filePath)) return null;
	try {
		const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
		return isHostServiceManifest(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Whether a signalable process with this pid is alive. */
export function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || !Number.isFinite(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
