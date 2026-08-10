import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PI_ACP_UPDATE_NOTICE_ENV = "SUPERSET_PI_ACP_UPDATE_NOTICE";
export const PI_ACP_QUIET_STARTUP_ENV = "SUPERSET_PI_ACP_QUIET_STARTUP";
export const PI_ACP_DISABLE_EXTENSIONS_ENV =
	"SUPERSET_PI_ACP_DISABLE_EXTENSIONS";
const DEFAULT_REFRESH_TTL_MS = 24 * 60 * 60 * 1_000;

type CommandRunner = (
	command: string,
	args: string[],
	options: { timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

function isSemver(version: string): boolean {
	return /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version);
}

function normalizedVersion(output: string): string | null {
	const version = output.trim().replace(/^v/i, "");
	return isSemver(version) ? version : null;
}

function compareSemver(a: string, b: string): number {
	const left = a.split(/[.-]/).slice(0, 3).map(Number);
	const right = b.split(/[.-]/).slice(0, 3).map(Number);
	for (let index = 0; index < 3; index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

export function formatPiUpdateNotice(
	installed: string | null,
	latest: string | null,
): string | null {
	if (!installed || !latest || compareSemver(latest, installed) <= 0) {
		return null;
	}
	return `New version available: v${latest} (installed v${installed}). Run: \`npm i -g @earendil-works/pi-coding-agent\``;
}

/**
 * A daemon-owned cache for Pi's advisory upgrade notice. Refreshing it is
 * fire-and-forget: ACP session/new reads the last completed value and never
 * waits for the local Pi executable or the npm registry.
 */
export class PiStartupCache {
	private updateNotice: string | null = null;
	private refreshing: Promise<void> | null = null;
	private lastAttemptAt = 0;

	constructor(
		private readonly run: CommandRunner = defaultCommandRunner,
		private readonly refreshTtlMs = DEFAULT_REFRESH_TTL_MS,
		private readonly now: () => number = Date.now,
	) {}

	getUpdateNotice(): string | null {
		return this.updateNotice;
	}

	refreshInBackground(): void {
		if (this.refreshing || this.now() - this.lastAttemptAt < this.refreshTtlMs)
			return;
		this.lastAttemptAt = this.now();
		this.refreshing = this.refresh()
			.catch(() => {
				// Upgrade checks are advisory and must never affect ACP startup.
			})
			.finally(() => {
				this.refreshing = null;
			});
	}

	private async refresh(): Promise<void> {
		const pi = await this.run("pi", ["--version"], { timeout: 1_000 });
		const installed = normalizedVersion(pi.stdout || pi.stderr);
		if (!installed) return;
		const npm = await this.run(
			"npm",
			["view", "@earendil-works/pi-coding-agent", "version"],
			{ timeout: 5_000 },
		);
		this.updateNotice = formatPiUpdateNotice(
			installed,
			normalizedVersion(npm.stdout),
		);
	}
}

/** Shared by in-process managers and the detached daemon, without eager I/O. */
export const sharedPiStartupCache = new PiStartupCache();

async function defaultCommandRunner(
	command: string,
	args: string[],
	options: { timeout: number },
): Promise<{ stdout: string; stderr: string }> {
	const result = await execFileAsync(command, args, options);
	return { stdout: result.stdout, stderr: result.stderr };
}
