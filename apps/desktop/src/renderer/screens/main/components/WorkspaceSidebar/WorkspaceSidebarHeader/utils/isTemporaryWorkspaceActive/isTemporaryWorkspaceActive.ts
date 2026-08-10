export function isTemporaryWorkspaceActive(
	workspaceId: string | undefined,
	temporaryWorkspaceId: string | undefined,
): boolean {
	return !!workspaceId && workspaceId === temporaryWorkspaceId;
}
