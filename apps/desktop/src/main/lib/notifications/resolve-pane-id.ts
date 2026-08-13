/**
 * Preserve an explicit pane id from legacy hook payloads without consulting
 * the retired main-process tabs snapshot. Hooks emitted by the current host
 * runtime carry a terminal id; the renderer resolves that terminal against
 * the durable Panes projection, which remains available when the workspace
 * view is unmounted.
 */
export function resolvePaneId(
	paneId: string | undefined,
	_tabId: string | undefined,
	_workspaceId: string | undefined,
): string | undefined {
	return paneId;
}
