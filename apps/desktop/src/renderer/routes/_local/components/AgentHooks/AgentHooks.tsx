import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useDefaultTerminalPresets } from "./hooks/useDefaultTerminalPresets";
import { usePlaceLocalWorktreesInSidebar } from "./hooks/usePlaceLocalWorktreesInSidebar";

/** Runs local agent setup hooks inside the local product-state provider. */
export function AgentHooks() {
	const { activeHostUrl } = useLocalHostService();
	// Seeds the default v2 terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultTerminalPresets(activeHostUrl);
	usePlaceLocalWorktreesInSidebar();
	return null;
}
