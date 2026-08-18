interface AcpPaneTitleState {
	/** First generated session title, kept stable for the tab label. */
	title?: string;
	/** Latest agent-provided title, shown in the pane status bar. */
	statusTitle?: string;
	latestUserMessage?: string;
}

/**
 * Keep the first meaningful agent title as the tab label while allowing later
 * session_info_update titles to describe current activity in the status bar.
 */
export function mergeAcpPaneTitles(
	current: AcpPaneTitleState,
	latestAgentTitle: string | null,
): { title: string | undefined; statusTitle: string | undefined } {
	const stableTitle = current.title?.trim() || undefined;
	const statusTitle = latestAgentTitle?.trim() || undefined;
	return {
		title: stableTitle ?? statusTitle,
		statusTitle,
	};
}

export function resolveAcpStatusBarTitle(
	acp: AcpPaneTitleState | undefined,
): string | null {
	return acp?.statusTitle ?? acp?.latestUserMessage ?? acp?.title ?? null;
}
