import { router } from "../..";
import { createBranchesRouter } from "./branches";
import { createFileContentsRouter } from "./file-contents";
import { createGitOperationsRouter } from "./git-operations";
import { createLogRouter } from "./log";
import { createStagingRouter } from "./staging";
import { createStashRouter } from "./stash";
import { createStatusRouter } from "./status";

export const createChangesRouter = () => {
	const branchesRouter = createBranchesRouter();
	const statusRouter = createStatusRouter();
	const fileContentsRouter = createFileContentsRouter();
	const stagingRouter = createStagingRouter();
	const gitOperationsRouter = createGitOperationsRouter();
	const stashRouter = createStashRouter();
	const logRouter = createLogRouter();

	return router({
		// Branch operations
		...branchesRouter._def.procedures,

		// Status operations
		...statusRouter._def.procedures,

		// File contents operations
		...fileContentsRouter._def.procedures,

		// Staging operations
		...stagingRouter._def.procedures,

		// Git operations (commit, push, pull, sync, createPR, mergeBranch, resetToCommit)
		...gitOperationsRouter._def.procedures,

		// Stash operations (list, apply, pop, drop, files, fileVersions)
		...stashRouter._def.procedures,

		// Log / file history
		...logRouter._def.procedures,
	});
};
