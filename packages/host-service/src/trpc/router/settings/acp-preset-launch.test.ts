import { describe, expect, test } from "bun:test";
import {
	acpPresetLaunchRouter,
	useAcpForAgentPresets,
} from "./acp-preset-launch";

describe("acpPresetLaunchRouter", () => {
	test("updates the process-local setting used by unattended dispatch", async () => {
		const caller = acpPresetLaunchRouter.createCaller({
			isAuthenticated: true,
			authKind: "psk",
		} as never);
		await caller.set({ enabled: true });
		expect(useAcpForAgentPresets()).toBe(true);
		expect(await caller.get()).toBe(true);
		await caller.set({ enabled: false });
		expect(useAcpForAgentPresets()).toBe(false);
	});
});
