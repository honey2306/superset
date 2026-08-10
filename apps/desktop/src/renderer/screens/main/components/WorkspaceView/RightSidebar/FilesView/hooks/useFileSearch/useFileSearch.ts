import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { SEARCH_RESULT_LIMIT } from "../../constants";
import { fileSearchQueryKey } from "../../fileQueryKeys";

interface UseFileSearchParams {
	workspaceId: string | undefined;
	searchTerm: string;
	includePattern?: string;
	excludePattern?: string;
	limit?: number;
}

export function useFileSearch({
	workspaceId,
	searchTerm,
	includePattern = "",
	excludePattern = "",
	limit = SEARCH_RESULT_LIMIT,
}: UseFileSearchParams) {
	const trimmedQuery = searchTerm.trim();
	const hostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	const { data: searchResults, isFetching } = useQuery({
		queryKey: [
			...fileSearchQueryKey(hostUrl, workspaceId),
			trimmedQuery,
			includePattern,
			excludePattern,
			limit,
		],
		enabled: Boolean(hostUrl && workspaceId && trimmedQuery.length > 0),
		queryFn: () => {
			if (!hostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(hostUrl).filesystem.searchFiles.query({
				workspaceId,
				query: trimmedQuery,
				includePattern,
				excludePattern,
				limit,
			});
		},
		placeholderData: keepPreviousData,
	});

	const results =
		searchResults?.matches.map((match) => ({
			id: match.absolutePath,
			name: match.name,
			path: match.absolutePath,
			relativePath: match.relativePath,
			isDirectory: match.kind === "directory",
			score: match.score,
		})) ?? [];

	return {
		searchResults: results,
		isFetching,
		hasQuery: trimmedQuery.length > 0,
	};
}
