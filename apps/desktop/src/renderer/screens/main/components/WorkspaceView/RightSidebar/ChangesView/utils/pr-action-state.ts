import type { MessageKey } from "renderer/providers/I18nProvider";

export interface PRActionStateInput {
	hasRepo: boolean;
	hasExistingPR: boolean;
	hasUpstream: boolean;
	pushCount: number;
	pullCount: number;
	isDefaultBranch: boolean;
}

export interface PRActionState {
	canCreatePR: boolean;
	createPRBlockedReason: MessageKey | null;
}

export function getPRActionState({
	hasRepo,
	hasExistingPR,
	hasUpstream,
	pushCount,
	pullCount,
	isDefaultBranch,
}: PRActionStateInput): PRActionState {
	if (hasExistingPR) {
		return { canCreatePR: false, createPRBlockedReason: null };
	}

	if (!hasRepo) {
		return {
			canCreatePR: false,
			createPRBlockedReason: "changes.prAction.githubNotAvailable",
		};
	}

	if (isDefaultBranch) {
		return {
			canCreatePR: false,
			createPRBlockedReason: "changes.prAction.cannotFromDefault",
		};
	}

	if (!hasUpstream) {
		return {
			canCreatePR: false,
			createPRBlockedReason: "changes.prAction.publishBranch",
		};
	}

	if (pushCount > 0 || pullCount > 0) {
		return {
			canCreatePR: false,
			createPRBlockedReason: "changes.prAction.syncWithUpstream",
		};
	}

	return { canCreatePR: true, createPRBlockedReason: null };
}
