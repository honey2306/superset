import {
	operationInputs,
	operations,
} from "../../../application/workspaces/cleanup/workspace-cleanup";
import { protectedProcedure, router } from "../../index";

export {
	__testDestroysInFlight,
	type DestroyWorkspaceInput,
	destroyWorkspace,
} from "../../../application/workspaces/cleanup/workspace-cleanup";
export const workspaceCleanupRouter = router({
	inspect: protectedProcedure
		.input(operationInputs.inspect)
		.query(operations.inspect),
	destroy: protectedProcedure
		.input(operationInputs.destroy)
		.mutation(operations.destroy),
	destroyOrphanWorktree: protectedProcedure
		.input(operationInputs.destroyOrphanWorktree)
		.mutation(operations.destroyOrphanWorktree),
});
