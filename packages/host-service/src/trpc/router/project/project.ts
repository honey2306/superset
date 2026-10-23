import {
	operationInputs,
	operations,
} from "../../../application/projects/project";
import { protectedProcedure, router } from "../../index";
export const projectRouter = router({
	list: protectedProcedure.query(operations.list),
	update: protectedProcedure
		.input(operationInputs.update)
		.mutation(operations.update),
	get: protectedProcedure.input(operationInputs.get).query(operations.get),
	listMemories: protectedProcedure
		.input(operationInputs.listMemories)
		.query(operations.listMemories),
	createMemory: protectedProcedure
		.input(operationInputs.createMemory)
		.mutation(operations.createMemory),
	updateMemory: protectedProcedure
		.input(operationInputs.updateMemory)
		.mutation(operations.updateMemory),
	deleteMemory: protectedProcedure
		.input(operationInputs.deleteMemory)
		.mutation(operations.deleteMemory),
	setSparseCheckoutPaths: protectedProcedure
		.input(operationInputs.setSparseCheckoutPaths)
		.mutation(operations.setSparseCheckoutPaths),
	setWorktreeBaseDir: protectedProcedure
		.input(operationInputs.setWorktreeBaseDir)
		.mutation(operations.setWorktreeBaseDir),
	setBranchPrefix: protectedProcedure
		.input(operationInputs.setBranchPrefix)
		.mutation(operations.setBranchPrefix),
	findBackfillConflict: protectedProcedure
		.input(operationInputs.findBackfillConflict)
		.query(operations.findBackfillConflict),
	findByPath: protectedProcedure
		.input(operationInputs.findByPath)
		.query(operations.findByPath),
	remove: protectedProcedure
		.input(operationInputs.remove)
		.mutation(operations.remove),
});
