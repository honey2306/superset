import { z } from "zod";
import {
	setAcpForAgentPresets,
	useAcpForAgentPresets,
} from "../../../application/agents/launch-preference";
import { protectedProcedure, router } from "../../index";
export const acpPresetLaunchRouter = router({
	get: protectedProcedure.query(() => useAcpForAgentPresets()),
	set: protectedProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(({ input }) => setAcpForAgentPresets(input.enabled)),
});
