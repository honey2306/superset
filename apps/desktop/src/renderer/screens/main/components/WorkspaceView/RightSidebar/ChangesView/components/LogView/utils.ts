export function toggleSelectedCommit(
	selectedHash: string | null,
	nextHash: string,
): string | null {
	return selectedHash === nextHash ? null : nextHash;
}

export function getLoadedCommitCount(
	loadedCount: number,
	hasMore: boolean,
): string {
	return `${loadedCount}${hasMore ? "+" : ""}`;
}
