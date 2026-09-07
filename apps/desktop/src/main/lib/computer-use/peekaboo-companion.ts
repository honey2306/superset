import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_BRIDGE_WAIT_MS = 8_000;
const POLL_INTERVAL_MS = 100;

export interface PeekabooCompanionState {
	available: boolean;
	executable?: string;
	appPath?: string;
	bridgeSocket?: string;
	launched: boolean;
	reason?: "app-not-installed" | "cli-not-installed" | "bridge-unavailable";
}

interface PeekabooCompanionDependencies {
	exists: (candidate: string) => boolean;
	launchApp: (appPath: string) => Promise<void>;
	sleep: (milliseconds: number) => Promise<void>;
	homeDirectory: string;
	pathValue?: string;
}

function executableOnPath(
	name: string,
	pathValue: string | undefined,
	exists: (candidate: string) => boolean,
): string | null {
	if (!pathValue) return null;
	for (const directory of pathValue.split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue;
		const candidate = path.join(directory, name);
		if (exists(candidate)) return candidate;
	}
	return null;
}

export function resolvePeekabooInstallation(
	input: {
		environment?: NodeJS.ProcessEnv;
		homeDirectory?: string;
		exists?: (candidate: string) => boolean;
	} = {},
): { executable: string | null; appPath: string | null; bridgeSocket: string } {
	const environment = input.environment ?? process.env;
	const homeDirectory = input.homeDirectory ?? homedir();
	const exists = input.exists ?? existsSync;
	const configuredExecutable = environment.SUPERSET_PEEKABOO_PATH;
	const executableCandidates = [
		configuredExecutable,
		executableOnPath("peekaboo", environment.PATH, exists),
		"/opt/homebrew/bin/peekaboo",
		"/usr/local/bin/peekaboo",
	].filter((candidate): candidate is string => Boolean(candidate));
	const executable = executableCandidates.find(exists) ?? null;
	const configuredApp = environment.SUPERSET_PEEKABOO_APP_PATH;
	const appCandidates = [
		configuredApp,
		"/Applications/Peekaboo.app",
		path.join(homeDirectory, "Applications", "Peekaboo.app"),
	].filter((candidate): candidate is string => Boolean(candidate));
	const appPath = appCandidates.find(exists) ?? null;
	const bridgeRoot =
		environment.SUPERSET_PEEKABOO_HOME ??
		path.join(homeDirectory, "Library", "Application Support", "Peekaboo");
	return {
		executable,
		appPath,
		bridgeSocket:
			environment.SUPERSET_PEEKABOO_BRIDGE_SOCKET ??
			path.join(bridgeRoot, "bridge.sock"),
	};
}

async function launchPeekabooApp(appPath: string): Promise<void> {
	await execFileAsync("/usr/bin/open", ["-gj", appPath], { timeout: 10_000 });
}

async function sleep(milliseconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Ensure the user's separately installed, signed Peekaboo app is available as
 * the TCC-owning GUI Bridge. Superset intentionally does not download, update,
 * or re-sign Peekaboo.
 */
export async function ensurePeekabooCompanion(
	environment: NodeJS.ProcessEnv = process.env,
	dependencies: Partial<PeekabooCompanionDependencies> = {},
	waitMs = DEFAULT_BRIDGE_WAIT_MS,
): Promise<PeekabooCompanionState> {
	if (process.platform !== "darwin") {
		return { available: false, launched: false, reason: "app-not-installed" };
	}
	const resolvedDependencies: PeekabooCompanionDependencies = {
		exists: dependencies.exists ?? existsSync,
		launchApp: dependencies.launchApp ?? launchPeekabooApp,
		sleep: dependencies.sleep ?? sleep,
		homeDirectory: dependencies.homeDirectory ?? homedir(),
		pathValue: dependencies.pathValue ?? environment.PATH,
	};
	const installation = resolvePeekabooInstallation({
		environment,
		homeDirectory: resolvedDependencies.homeDirectory,
		exists: resolvedDependencies.exists,
	});
	if (!installation.appPath) {
		return { available: false, launched: false, reason: "app-not-installed" };
	}
	if (!installation.executable) {
		return {
			available: false,
			appPath: installation.appPath,
			launched: false,
			reason: "cli-not-installed",
		};
	}

	let launched = false;
	if (!resolvedDependencies.exists(installation.bridgeSocket)) {
		await resolvedDependencies.launchApp(installation.appPath);
		launched = true;
	}
	const deadline = Date.now() + waitMs;
	while (!resolvedDependencies.exists(installation.bridgeSocket)) {
		if (Date.now() >= deadline) {
			return {
				available: false,
				executable: installation.executable,
				appPath: installation.appPath,
				bridgeSocket: installation.bridgeSocket,
				launched,
				reason: "bridge-unavailable",
			};
		}
		await resolvedDependencies.sleep(POLL_INTERVAL_MS);
	}

	environment.SUPERSET_PEEKABOO_PATH = installation.executable;
	environment.SUPERSET_PEEKABOO_APP_PATH = installation.appPath;
	environment.SUPERSET_PEEKABOO_BRIDGE_SOCKET = installation.bridgeSocket;
	return {
		available: true,
		executable: installation.executable,
		appPath: installation.appPath,
		bridgeSocket: installation.bridgeSocket,
		launched,
	};
}
