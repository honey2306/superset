import { z } from "zod";
import { protectedProcedure, router } from "../../index";

let enabled = process.env.SUPERSET_USE_ACP_FOR_AGENT_PRESETS === "1";

export function useAcpForAgentPresets(): boolean {
	return enabled;
}

export const acpPresetLaunchRouter = router({
	get: protectedProcedure.query(() => enabled),
	set: protectedProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(({ input }) => {
			enabled = input.enabled;
			return enabled;
		}),
});
