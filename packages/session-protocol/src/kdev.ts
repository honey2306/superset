const KDEV_HOST = "kdev.corp.kuaishou.com";
const KDEV_GIT_HOSTS = "(?:kdev|git)\\.corp\\.kuaishou\\.com";

/** Converts KDev HTTPS and SSH clone remotes to the repository path KDev serves. */
export function getKDevRepositoryPath(remoteUrl: string | null): string | null {
	if (!remoteUrl) return null;

	const normalized = remoteUrl.trim().replace(/\.git\/?$/, "");
	const httpsMatch = normalized.match(
		new RegExp(`^https?://${KDEV_GIT_HOSTS}/(?:git/)?(.+)$`, "i"),
	);
	if (httpsMatch?.[1]) return httpsMatch[1];

	const sshMatch = normalized.match(
		new RegExp(
			`^(?:ssh://)?git@${KDEV_GIT_HOSTS}(?::\\d+)?(?::|/)(?:git/)?(.+)$`,
			"i",
		),
	);
	return sshMatch?.[1] || null;
}

/** Builds the KDev create-MR page URL; this never creates an MR itself. */
export function buildKDevCreateMergeRequestUrl(
	remoteUrl: string | null,
	currentBranch: string,
): string | null {
	const repositoryPath = getKDevRepositoryPath(remoteUrl);
	if (!repositoryPath || !currentBranch) return null;
	return `https://${KDEV_HOST}/git/${repositoryPath}/-/create_MR?branchName=${encodeURIComponent(currentBranch)}`;
}
