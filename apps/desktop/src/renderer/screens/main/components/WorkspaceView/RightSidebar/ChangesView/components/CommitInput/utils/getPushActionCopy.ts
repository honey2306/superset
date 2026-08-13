import type { GitHubStatus } from "@superset/shared/desktop-types";
import type { MessageKey } from "renderer/providers/I18nProvider";

type PushActionPullRequest = Pick<
	NonNullable<GitHubStatus["pr"]>,
	"headRefName" | "headRepositoryOwner"
>;

export interface PushActionCopy {
	labelKey: MessageKey;
	menuLabelKey: MessageKey;
	tooltipKey: MessageKey;
	tooltipValues?: Record<string, number | string>;
}

function formatPullRequestPushTarget(
	pullRequest?: PushActionPullRequest | null,
): string | null {
	const branch = pullRequest?.headRefName?.trim();
	if (!branch) {
		return null;
	}

	const owner = pullRequest?.headRepositoryOwner?.trim();
	return owner ? `${owner}:${branch}` : branch;
}

export function getPushActionCopy({
	hasUpstream,
	pushCount,
	pullRequest,
}: {
	hasUpstream: boolean;
	pushCount: number;
	pullRequest?: PushActionPullRequest | null;
}): PushActionCopy {
	const pullRequestTarget = formatPullRequestPushTarget(pullRequest);
	if (pullRequestTarget) {
		return {
			labelKey: "changes.push.toPR",
			menuLabelKey: "changes.push.toPR",
			tooltipKey:
				pushCount > 0
					? "changes.push.pushCommitsTooltip"
					: "changes.push.pushChangesTooltip",
			tooltipValues: {
				count: pushCount,
				target: pullRequestTarget,
			},
		};
	}

	if (!hasUpstream) {
		return {
			labelKey: "changes.push.publishBranch",
			menuLabelKey: "changes.push.publishBranch",
			tooltipKey: "changes.push.publishBranchTooltip",
		};
	}

	return {
		labelKey: "changes.push.push",
		menuLabelKey: "changes.push.push",
		tooltipKey:
			pushCount > 0
				? "changes.push.pushCommits"
				: "changes.push.pushBranchChanges",
		tooltipValues: pushCount > 0 ? { count: pushCount } : undefined,
	};
}
