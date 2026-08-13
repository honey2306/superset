import { protectedProcedure, router } from "../../index";

export const usageRouter = router({
	getCodex: protectedProcedure.query(({ ctx }) => {
		return ctx.runtime.auth.getCodexUsage();
	}),
});
