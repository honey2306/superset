import { z } from "zod";
import { runAgentInWorkspace } from "../../../application/agents/agent-launch";
import { protectedProcedure, router } from "../../index";

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				// Empty means launch the configured interactive CLI without a
				// prompt. buildAgentCommandString deliberately drops prompt-only
				// flags for this case.
				prompt: z.string(),
				terminalId: z.string().min(1).optional(),
				attachmentIds: z.array(z.string().uuid()).optional(),
				model: z.string().min(1).optional(),
				effort: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
});
