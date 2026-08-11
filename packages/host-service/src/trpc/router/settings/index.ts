import { router } from "../../index";
import { acpPresetLaunchRouter } from "./acp-preset-launch";
import { agentConfigsRouter } from "./agent-configs";
import { branchPrefixRouter } from "./branch-prefix";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	branchPrefix: branchPrefixRouter,
	worktreeLocation: worktreeLocationRouter,
	acpPresetLaunch: acpPresetLaunchRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { HostWorktreeLocationSettings } from "./worktree-location";
