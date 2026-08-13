import { useEffect, useRef, useState } from "react";
import {
	GITHUB_STATUS_STALE_TIME_MS,
	type GitHubStatusQuerySurface,
} from "./githubQueryPolicy";
import { useHostGitHubStatus } from "./useHostGitHubStatus";

interface UseHoverGitHubStatusOptions {
	workspaceId: string | null | undefined;
	surface: GitHubStatusQuerySurface;
	isWorktree: boolean;
}

export function useHoverGitHubStatus({
	workspaceId,
	surface,
	isWorktree,
}: UseHoverGitHubStatusOptions) {
	const [hasHovered, setHasHovered] = useState(false);
	const {
		data: githubStatus,
		dataUpdatedAt,
		isStale,
		refetch,
	} = useHostGitHubStatus({
		workspaceId,
		surface,
		isActive: hasHovered && isWorktree,
	});

	const pendingRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (pendingRefetchRef.current) clearTimeout(pendingRefetchRef.current);
		},
		[],
	);

	const onMouseEnter = () => {
		if (!hasHovered) {
			setHasHovered(true);
		} else if (isStale) {
			if (pendingRefetchRef.current) {
				clearTimeout(pendingRefetchRef.current);
				pendingRefetchRef.current = null;
			}
			void refetch();
		} else if (!pendingRefetchRef.current) {
			const msUntilStale =
				GITHUB_STATUS_STALE_TIME_MS - (Date.now() - dataUpdatedAt);
			pendingRefetchRef.current = setTimeout(
				() => {
					pendingRefetchRef.current = null;
					void refetch();
				},
				Math.max(0, msUntilStale),
			);
		}
	};

	return { githubStatus, hasHovered, onMouseEnter };
}
