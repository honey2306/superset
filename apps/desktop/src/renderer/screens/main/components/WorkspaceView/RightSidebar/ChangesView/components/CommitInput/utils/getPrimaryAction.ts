import type { MessageKey } from "renderer/providers/I18nProvider";

export type PrimaryActionType = "commit" | "sync" | "push" | "pull";

export interface PrimaryActionInput {
	canCommit: boolean;
	hasStagedChanges: boolean;
	isPending: boolean;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	pushActionCopy: Pick<
		PushActionCopyForPrimary,
		"labelKey" | "tooltipKey" | "tooltipValues"
	>;
}

export interface PushActionCopyForPrimary {
	labelKey: MessageKey;
	tooltipKey: MessageKey;
	tooltipValues?: Record<string, number | string>;
}

export interface PrimaryActionState {
	action: PrimaryActionType;
	labelKey: MessageKey;
	tooltipKey: MessageKey;
	tooltipValues?: Record<string, number | string>;
	disabled: boolean;
}

export function getPrimaryAction({
	canCommit,
	hasStagedChanges,
	isPending,
	pushCount,
	pullCount,
	hasUpstream,
	pushActionCopy,
}: PrimaryActionInput): PrimaryActionState {
	if (canCommit) {
		return {
			action: "commit",
			labelKey: "changes.primaryAction.commit",
			tooltipKey: "changes.primaryAction.commitStaged",
			disabled: isPending,
		};
	}

	if (pushCount > 0 && pullCount > 0) {
		return {
			action: "sync",
			labelKey: "changes.primaryAction.sync",
			tooltipKey: "changes.primaryAction.syncTooltip",
			tooltipValues: { pull: pullCount, push: pushCount },
			disabled: isPending,
		};
	}

	if (pushCount > 0) {
		return {
			action: "push",
			labelKey: pushActionCopy.labelKey,
			disabled: isPending,
			tooltipKey: pushActionCopy.tooltipKey,
			tooltipValues: pushActionCopy.tooltipValues,
		};
	}

	if (pullCount > 0) {
		return {
			action: "pull",
			labelKey: "changes.primaryAction.pull",
			tooltipKey: "changes.primaryAction.pullTooltip",
			tooltipValues: { count: pullCount },
			disabled: isPending,
		};
	}

	if (!hasUpstream) {
		return {
			action: "push",
			labelKey: pushActionCopy.labelKey,
			disabled: isPending,
			tooltipKey: pushActionCopy.tooltipKey,
			tooltipValues: pushActionCopy.tooltipValues,
		};
	}

	return {
		action: "commit",
		labelKey: "changes.primaryAction.commit",
		disabled: true,
		tooltipKey: hasStagedChanges
			? "changes.primaryAction.enterMessage"
			: "changes.primaryAction.noStagedChanges",
	};
}
