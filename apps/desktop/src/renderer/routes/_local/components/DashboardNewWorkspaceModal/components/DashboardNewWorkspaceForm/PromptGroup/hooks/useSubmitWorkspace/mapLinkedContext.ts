import type { DashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";

interface MappedLinkedContext {
	githubIssueUrls: string[] | undefined;
	linkedPrUrl: string | undefined;
}

/** Maps linked GitHub issues and PR into the API payload shape. */
export function mapLinkedContext(
	draft: DashboardNewWorkspaceDraft,
): MappedLinkedContext {
	const githubIssueUrls = draft.linkedIssues
		.filter((issue) => issue.source === "github" && issue.url)
		.map((issue) => issue.url as string);

	return {
		githubIssueUrls: githubIssueUrls.length > 0 ? githubIssueUrls : undefined,
		linkedPrUrl: draft.linkedPR?.url,
	};
}
