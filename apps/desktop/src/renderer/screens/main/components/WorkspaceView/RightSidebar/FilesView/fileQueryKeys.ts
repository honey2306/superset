export function fileSearchQueryKey(
	hostUrl: string | null,
	workspaceId: string | undefined,
) {
	return ["host-filesystem-search", hostUrl, workspaceId] as const;
}
