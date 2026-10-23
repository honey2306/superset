import { z } from "zod";
import {
	getWorktreeLocation,
	setWorktreeLocation,
} from "../../../application/workspaces/worktree-location";
import { protectedProcedure, router } from "../../index";
export const worktreeLocationRouter = router({
	get: protectedProcedure.query(({ ctx }) => getWorktreeLocation(ctx)),
	set: protectedProcedure
		.input(z.object({ path: z.string().nullable() }))
		.mutation(({ ctx, input }) => setWorktreeLocation(ctx, input.path)),
});
