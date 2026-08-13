import { router } from "../../index";
import {
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
});
