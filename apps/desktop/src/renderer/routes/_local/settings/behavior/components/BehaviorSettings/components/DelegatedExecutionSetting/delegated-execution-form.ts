export interface DelegatedExecutionDraft {
	enabled: boolean;
	executorAgentConfigId: string | null;
	executorModelId: string | null;
}

export function areDelegatedExecutionDraftsEqual(
	left: DelegatedExecutionDraft,
	right: DelegatedExecutionDraft,
): boolean {
	return (
		left.enabled === right.enabled &&
		left.executorAgentConfigId === right.executorAgentConfigId &&
		left.executorModelId === right.executorModelId
	);
}

export function shouldAdoptDelegatedExecutionQueryData(
	currentDraft: DelegatedExecutionDraft,
	baseline: DelegatedExecutionDraft | null,
): boolean {
	return (
		baseline === null ||
		areDelegatedExecutionDraftsEqual(currentDraft, baseline)
	);
}

export function shouldApplyDelegatedExecutionSaveResult(input: {
	currentHostUrl: string | null;
	requestHostUrl: string;
	currentDraft: DelegatedExecutionDraft;
	submittedDraft: DelegatedExecutionDraft;
}): boolean {
	return (
		input.currentHostUrl === input.requestHostUrl &&
		areDelegatedExecutionDraftsEqual(input.currentDraft, input.submittedDraft)
	);
}

export function canSaveDelegatedExecutionDraft(
	draft: DelegatedExecutionDraft,
	requiresModel: boolean,
): boolean {
	return (
		!draft.enabled ||
		(draft.executorAgentConfigId !== null &&
			(!requiresModel || draft.executorModelId !== null))
	);
}
