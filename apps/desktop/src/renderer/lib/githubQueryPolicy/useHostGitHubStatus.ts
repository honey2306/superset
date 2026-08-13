import type { GitHubStatus } from "@superset/shared/desktop-types";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	useCatalogProject,
	useCatalogWorkspace,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import {
	type GitHubStatusQuerySurface,
	getGitHubStatusQueryPolicy,
} from "./githubQueryPolicy";

function mapCheckStatus(check: {
	status: string;
	conclusion: string | null;
}): "success" | "failure" | "pending" | "skipped" | "cancelled" {
	if (check.status !== "completed") return "pending";
	if (check.conclusion === "success") return "success";
	if (check.conclusion === "skipped" || check.conclusion === "neutral") {
		return "skipped";
	}
	if (check.conclusion === "cancelled") return "cancelled";
	return "failure";
}

function aggregateChecksStatus(
	checks: Array<{ status: string; conclusion: string | null }>,
): "success" | "failure" | "pending" | "none" {
	if (checks.length === 0) return "none";
	const statuses = checks.map(mapCheckStatus);
	if (statuses.includes("pending")) return "pending";
	if (statuses.includes("failure") || statuses.includes("cancelled")) {
		return "failure";
	}
	return "success";
}

export function useHostGitHubStatus({
	workspaceId,
	surface,
	isActive = true,
}: {
	workspaceId: string | null | undefined;
	surface: GitHubStatusQuerySurface;
	isActive?: boolean;
}) {
	const hostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	const { workspace } = useCatalogWorkspace(workspaceId ?? "");
	const { project } = useCatalogProject(workspace?.projectId);
	const queryPolicy = getGitHubStatusQueryPolicy(surface, {
		hasWorkspaceId: Boolean(workspaceId),
		isActive,
	});

	return useQuery({
		queryKey: ["host-github-status", hostUrl, workspaceId],
		...queryPolicy,
		enabled: queryPolicy.enabled && Boolean(hostUrl && workspace && project),
		queryFn: async (): Promise<GitHubStatus | null> => {
			if (!hostUrl || !workspace || !project) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			const [pullRequest, status] = await Promise.all([
				client.git.getPullRequest.query({ workspaceId: workspace.id }),
				client.git.getStatus.query({
					workspaceId: workspace.id,
					priority: "background",
				}),
			]);
			const repoUrl = project.repoUrl;
			if (!repoUrl) return null;
			const checks = pullRequest?.checks ?? [];
			return {
				pr: pullRequest
					? {
							number: pullRequest.number,
							title: pullRequest.title,
							url: pullRequest.url,
							state: pullRequest.isDraft
								? "draft"
								: pullRequest.state === "queued"
									? "open"
									: pullRequest.state,
							additions: 0,
							deletions: 0,
							headRefName: pullRequest.headRefName,
							headRepositoryOwner: pullRequest.repoOwner,
							headRepositoryName: pullRequest.repoName,
							reviewDecision:
								pullRequest.reviewDecision === "approved"
									? "approved"
									: pullRequest.reviewDecision === "changes_requested"
										? "changes_requested"
										: "pending",
							checksStatus: aggregateChecksStatus(checks),
							checks: checks.map((check) => ({
								name: check.name,
								status: mapCheckStatus(check),
								...(check.detailsUrl && { url: check.detailsUrl }),
							})),
							requestedReviewers: [],
						}
					: null,
				repoUrl,
				branchExistsOnRemote: status.currentBranch.upstream !== null,
				lastRefreshed: Date.now(),
			};
		},
	});
}
