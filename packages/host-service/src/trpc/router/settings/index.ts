import { router } from "../../index";
import { acpPresetLaunchRouter } from "./acp-preset-launch";
import { agentConfigsRouter } from "./agent-configs";
import { branchPrefixRouter } from "./branch-prefix";
import { delegatedExecutionRouter } from "./delegated-execution";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	branchPrefix: branchPrefixRouter,
	delegatedExecution: delegatedExecutionRouter,
	worktreeLocation: worktreeLocationRouter,
	acpPresetLaunch: acpPresetLaunchRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type {
	DelegatedExecutionSettings,
	DelegationProfile,
	DelegationProfilesState,
} from "./delegated-execution";
export type { HostWorktreeLocationSettings } from "./worktree-location";
