import { usePortKillActions } from "renderer/hooks/ports/usePortKillActions";
import type { WorkspacePort } from "./usePortsData";

export function useKillPort() {
	return usePortKillActions<WorkspacePort>();
}
