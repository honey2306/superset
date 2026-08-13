import type { GitHubStatus } from "@superset/shared/desktop-types";
import {
	type GitHubStatusQuerySurface,
	useHostGitHubStatus,
} from "renderer/lib/githubQueryPolicy";

interface UsePRStatusOptions {
	workspaceId: string | undefined;
	enabled?: boolean;
	surface?: Extract<
		GitHubStatusQuerySurface,
		"workspace-hover-card" | "workspace-page"
	>;
}

interface UsePRStatusResult {
	pr: GitHubStatus["pr"] | null;
	repoUrl: string | null;
	branchExistsOnRemote: boolean;
	previewUrl: string | undefined;
	isLoading: boolean;
	refetch: () => void;
}

export function usePRStatus({
	workspaceId,
	enabled = true,
	surface = "workspace-page",
}: UsePRStatusOptions): UsePRStatusResult {
	const {
		data: githubStatus,
		isLoading,
		refetch,
	} = useHostGitHubStatus({
		workspaceId,
		surface,
		isActive: enabled,
	});

	return {
		pr: githubStatus?.pr ?? null,
		repoUrl: githubStatus?.repoUrl ?? null,
		branchExistsOnRemote: githubStatus?.branchExistsOnRemote ?? false,
		previewUrl: githubStatus?.previewUrl,
		isLoading,
		refetch: () => void refetch(),
	};
}
