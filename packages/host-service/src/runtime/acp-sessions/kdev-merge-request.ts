import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildKDevCreateMergeRequestUrl } from "@superset/session-protocol";

const execFileAsync = promisify(execFile);

export interface KDevMergeRequestPage {
	provider: "kdev";
	url: string;
	sourceBranch: string;
}

type RunGit = (args: string[], cwd: string) => Promise<string>;

const runGit: RunGit = async (args, cwd) => {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		encoding: "utf8",
		windowsHide: true,
	});
	return stdout.trim();
};

async function gitValue(
	run: RunGit,
	args: string[],
	cwd: string,
): Promise<string | null> {
	try {
		const value = await run(args, cwd);
		return value || null;
	} catch {
		return null;
	}
}

/**
 * Derives a KDev create-MR page from a trusted ACP session cwd. No caller can
 * supply a filesystem path, remote URL, branch, target, or arbitrary URL.
 */
export async function resolveKDevMergeRequestPage(
	cwd: string,
	dependencies: { runGit?: RunGit } = {},
): Promise<KDevMergeRequestPage> {
	const run = dependencies.runGit ?? runGit;
	const repositoryRoot = await gitValue(
		run,
		["rev-parse", "--show-toplevel"],
		cwd,
	);
	if (!repositoryRoot) {
		throw new Error("The current session is not inside a Git repository.");
	}

	const sourceBranch = await gitValue(
		run,
		["symbolic-ref", "--quiet", "--short", "HEAD"],
		repositoryRoot,
	);
	if (!sourceBranch) {
		throw new Error(
			"Cannot open a merge request from a detached HEAD. Check out a branch first.",
		);
	}

	const origin = await gitValue(
		run,
		["remote", "get-url", "origin"],
		repositoryRoot,
	);
	if (!origin) {
		throw new Error(
			'Git remote "origin" is not configured for this repository.',
		);
	}

	const url = buildKDevCreateMergeRequestUrl(origin, sourceBranch);
	if (!url) {
		throw new Error('Git remote "origin" is not a supported KDev repository.');
	}
	return { provider: "kdev", url, sourceBranch };
}
