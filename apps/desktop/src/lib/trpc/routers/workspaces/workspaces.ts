import { mergeRouters } from "../..";
import { createGitStatusProcedures } from "./procedures/git-status";
import { createQueryProcedures } from "./procedures/query";
import { createSectionsProcedures } from "./procedures/sections";
import { createStatusProcedures } from "./procedures/status";

export const createWorkspacesRouter = () => {
	return mergeRouters(
		createQueryProcedures(),
		createGitStatusProcedures(),
		createStatusProcedures(),
		createSectionsProcedures(),
	);
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
