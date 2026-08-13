/** The workspace screen owns creation of ACP and terminal tabs. */
export function workspaceTabManagementPath(workspaceId: string): string {
	return `/w/${encodeURIComponent(workspaceId)}`;
}
