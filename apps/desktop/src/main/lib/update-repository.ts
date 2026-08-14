/**
 * The GitHub repository that owns release assets for a packaged desktop build.
 *
 * GitHub Actions supplies `github.repository` at build time. Keep a trusted,
 * valid default for local builds so an arbitrary environment value cannot turn
 * the updater into a request to an unintended host or path.
 */
export const DEFAULT_UPDATE_REPOSITORY = "superset-sh/superset";
const defaultUpdateRepository: UpdateRepository = {
	owner: "superset-sh",
	repo: "superset",
};

export interface UpdateRepository {
	owner: string;
	repo: string;
}

const GITHUB_OWNER_PATTERN = /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z\d._-]{1,100}$/;

export function parseUpdateRepository(
	repository: string | undefined,
): UpdateRepository | undefined {
	if (!repository) return undefined;
	const [owner, repo, ...rest] = repository.split("/");
	if (
		rest.length > 0 ||
		!owner ||
		!repo ||
		!GITHUB_OWNER_PATTERN.test(owner) ||
		!GITHUB_REPOSITORY_PATTERN.test(repo)
	) {
		return undefined;
	}
	return { owner, repo };
}

export function resolveUpdateRepository(
	repository: string | undefined,
): UpdateRepository {
	return parseUpdateRepository(repository) ?? defaultUpdateRepository;
}

export function getUpdateFeedUrl(
	repository: UpdateRepository,
	isCanary: boolean,
): string {
	const releasePath = isCanary
		? "releases/download/desktop-canary"
		: "releases/latest/download";
	return `https://github.com/${repository.owner}/${repository.repo}/${releasePath}`;
}
