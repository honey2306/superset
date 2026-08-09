export type PullRequestMenuAction = "open" | "unlink" | "restore";

export function getPullRequestMenuActions({
	hasLinkedPullRequest,
	isPullRequestSuppressed,
}: {
	hasLinkedPullRequest: boolean;
	isPullRequestSuppressed: boolean;
}): PullRequestMenuAction[] {
	if (hasLinkedPullRequest) return ["open", "unlink"];
	if (isPullRequestSuppressed) return ["restore"];
	return [];
}
