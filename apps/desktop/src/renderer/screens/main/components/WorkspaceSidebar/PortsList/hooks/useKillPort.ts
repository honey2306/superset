import { usePortKillActions } from "renderer/hooks/ports/usePortKillActions";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { V1WorkspacePort } from "./usePortsData";

export function useKillPort() {
	const killMutation = electronTrpc.ports.kill.useMutation();
	return usePortKillActions<V1WorkspacePort>({
		localKill: killMutation.mutateAsync,
		externalPending: killMutation.isPending,
	});
}
