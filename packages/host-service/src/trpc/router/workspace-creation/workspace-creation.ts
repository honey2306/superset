import { router } from "../../index";
import {
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
});
