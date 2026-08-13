import { execWithShellEnv } from "./shell-env";

export async function getGitAuthorName(
	repoPath?: string,
): Promise<string | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"git",
			["config", "--get", "user.name"],
			{ cwd: repoPath },
		);
		return stdout.trim() || null;
	} catch (error) {
		console.warn("[git/getGitAuthorName] Failed to read git user.name:", error);
		return null;
	}
}

let cachedGitHubUsername: { value: string | null; timestamp: number } | null =
	null;
const GITHUB_USERNAME_CACHE_TTL = 5 * 60 * 1000;

export async function getGitHubUsername(): Promise<string | null> {
	if (
		cachedGitHubUsername &&
		Date.now() - cachedGitHubUsername.timestamp < GITHUB_USERNAME_CACHE_TTL
	) {
		return cachedGitHubUsername.value;
	}

	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["api", "user", "--jq", ".login"],
			{ timeout: 10_000 },
		);
		const value = stdout.trim() || null;
		cachedGitHubUsername = { value, timestamp: Date.now() };
		return value;
	} catch (error) {
		console.warn(
			"[git/getGitHubUsername] Failed to get GitHub username:",
			error instanceof Error ? error.message : String(error),
		);
		cachedGitHubUsername = { value: null, timestamp: Date.now() };
		return null;
	}
}
