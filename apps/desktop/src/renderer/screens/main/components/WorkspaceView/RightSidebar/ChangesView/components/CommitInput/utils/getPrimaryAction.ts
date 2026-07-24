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
			labelKey: "v1Changes.primaryAction.commit",
			tooltipKey: "v1Changes.primaryAction.commitStaged",
			disabled: isPending,
		};
	}

	if (pushCount > 0 && pullCount > 0) {
		return {
			action: "sync",
			labelKey: "v1Changes.primaryAction.sync",
			tooltipKey: "v1Changes.primaryAction.syncTooltip",
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
			labelKey: "v1Changes.primaryAction.pull",
			tooltipKey: "v1Changes.primaryAction.pullTooltip",
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
		labelKey: "v1Changes.primaryAction.commit",
		disabled: true,
		tooltipKey: hasStagedChanges
			? "v1Changes.primaryAction.enterMessage"
			: "v1Changes.primaryAction.noStagedChanges",
	};
}
