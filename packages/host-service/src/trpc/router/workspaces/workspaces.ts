import {
	operationInputs,
	operations,
} from "../../../application/workspaces/workspace-operations";
import { protectedProcedure, router } from "../../index";
export const workspacesRouter = router({
	aiRename: protectedProcedure
		.input(operationInputs.aiRename)
		.mutation(operations.aiRename),
	generateBranchName: protectedProcedure
		.input(operationInputs.generateBranchName)
		.mutation(operations.generateBranchName),
});
