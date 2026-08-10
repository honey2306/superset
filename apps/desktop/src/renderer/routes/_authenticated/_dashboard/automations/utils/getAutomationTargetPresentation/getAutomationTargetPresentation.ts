interface AutomationTargetPresentationInput {
	isTemporaryTarget: boolean;
	workspaceId: string | null;
	workspaceName: string | null;
	newWorkspaceLabel: string;
	deletedWorkspaceLabel: string;
}

export function getAutomationTargetPresentation({
	isTemporaryTarget,
	workspaceId,
	workspaceName,
	newWorkspaceLabel,
	deletedWorkspaceLabel,
}: AutomationTargetPresentationInput) {
	return {
		isTemporaryTarget,
		workspaceLabel: isTemporaryTarget
			? "—"
			: !workspaceId
				? newWorkspaceLabel
				: (workspaceName ?? deletedWorkspaceLabel),
	};
}
