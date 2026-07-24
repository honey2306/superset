import type { GitHubStatus } from "@superset/local-db";
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
			labelKey: "v1Changes.push.toPR",
			menuLabelKey: "v1Changes.push.toPR",
			tooltipKey:
				pushCount > 0
					? "v1Changes.push.pushCommitsTooltip"
					: "v1Changes.push.pushChangesTooltip",
			tooltipValues: {
				count: pushCount,
				target: pullRequestTarget,
			},
		};
	}

	if (!hasUpstream) {
		return {
			labelKey: "v1Changes.push.publishBranch",
			menuLabelKey: "v1Changes.push.publishBranch",
			tooltipKey: "v1Changes.push.publishBranchTooltip",
		};
	}

	return {
		labelKey: "v1Changes.push.push",
		menuLabelKey: "v1Changes.push.push",
		tooltipKey:
			pushCount > 0
				? "v1Changes.push.pushCommits"
				: "v1Changes.push.pushBranchChanges",
		tooltipValues: pushCount > 0 ? { count: pushCount } : undefined,
	};
}
