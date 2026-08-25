/** The phone workspace screen owns creation of ACP tabs. */
export function workspaceTabManagementPath(workspaceId: string): string {
	return `/w/${encodeURIComponent(workspaceId)}`;
}
