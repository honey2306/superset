import {
	listRunsSchema,
	runReferenceSchema,
} from "@superset/host-contract/runs";
import { createHostRunService } from "../../../application/runs/host-runs";
import { protectedProcedure, router } from "../../index";
export const runsRouter = router({
	list: protectedProcedure
		.input(listRunsSchema)
		.query(({ ctx, input }) => createHostRunService(ctx).list(input)),
	get: protectedProcedure
		.input(runReferenceSchema)
		.query(({ ctx, input }) => createHostRunService(ctx).get(input)),
	cancel: protectedProcedure
		.input(runReferenceSchema)
		.mutation(({ ctx, input }) =>
			createHostRunService(ctx).stop(input, "cancel"),
		),
	pause: protectedProcedure
		.input(runReferenceSchema)
		.mutation(({ ctx, input }) =>
			createHostRunService(ctx).stop(input, "pause"),
		),
});
