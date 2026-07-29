import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";

const CTRL_C_INPUT = "\u0003";

export function V1PanesWorkspaceRunButton({
	workspaceId,
	worktreePath,
	store,
}: {
	workspaceId: string;
	worktreePath?: string;
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
}) {
	const tabs = useStore(store, (state) => state.tabs);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath,
		forceEnabled: true,
	});
	const runPane = tabs
		.flatMap((tab) => Object.values(tab.panes))
		.find(
			(pane) =>
				pane.data.workspaceRun?.workspaceId === workspaceId &&
				pane.data.workspaceRun.state === "running",
		);

	const handleRun = async () => {
		if (runPane?.data.terminalId && hostUrl && hostWorkspaceId) {
			try {
				await getHostServiceClientByUrl(hostUrl).terminal.writeInput.mutate({
					terminalId: runPane.data.terminalId,
					workspaceId: hostWorkspaceId,
					data: CTRL_C_INPUT,
				});
				store.getState().setPaneData({
					paneId: runPane.id,
					data: {
						...runPane.data,
						workspaceRun: {
							workspaceId,
							...runPane.data.workspaceRun,
							state: "stopped-by-user",
						},
					},
				});
			} catch (error) {
				toast.error("Failed to stop workspace run command", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
			return;
		}

		const definition =
			await electronTrpcClient.workspaces.getWorkspaceRunDefinition.query({
				workspaceId,
			});
		const command = buildTerminalCommand(definition?.commands);
		if (!command) {
			toast.error("No workspace run command configured");
			return;
		}
		const terminalId = crypto.randomUUID();
		store.getState().addTab({
			titleOverride: "Workspace Run",
			panes: [
				{
					kind: "terminal",
					titleOverride: "Workspace Run",
					data: {
						terminalId,
						initialCommand: command,
						initialCwd: definition?.cwd ?? worktreePath,
						workspaceRun: { workspaceId, state: "running", command },
					},
				},
			],
		});
	};

	return (
		<Button className="h-7" onClick={() => void handleRun()} size="sm">
			{runPane ? "Stop" : "Run"}
		</Button>
	);
}
