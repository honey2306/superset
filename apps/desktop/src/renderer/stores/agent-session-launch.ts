import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { TerminalPreset } from "@superset/shared/desktop-types";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface PendingTerminalSetup {
	workspaceId: string;
	projectId: string;
	initialCommands: string[] | null;
	/** When undefined, the caller has not supplied a preset list. */
	defaultPresets?: TerminalPreset[];
	/** Agent command to run in a separate pane from the setup script. */
	agentCommand?: string;
	/** Canonical launch request used by the orchestrator. */
	agentLaunchRequest?: AgentLaunchRequest;
}

interface AgentSessionLaunchState {
	pendingTerminalSetups: Record<string, PendingTerminalSetup>;
	addPendingTerminalSetup: (setup: PendingTerminalSetup) => void;
	removePendingTerminalSetup: (workspaceId: string) => void;
}

/**
 * Pending launches are renderer presentation work for an already-known
 * Workspace. They are intentionally separate from Provisioning operation
 * state: Provisioning owns workspace identity and initial session intents,
 * while this queue handles command-watcher launches that need a new pane.
 */
export const useAgentSessionLaunchStore = create<AgentSessionLaunchState>()(
	devtools(
		(set) => ({
			pendingTerminalSetups: {},

			addPendingTerminalSetup: (setup) => {
				set((state) => ({
					pendingTerminalSetups: {
						...state.pendingTerminalSetups,
						[setup.workspaceId]: setup,
					},
				}));
			},

			removePendingTerminalSetup: (workspaceId) => {
				set((state) => {
					const { [workspaceId]: _, ...rest } = state.pendingTerminalSetups;
					return { pendingTerminalSetups: rest };
				});
			},
		}),
		{ name: "AgentSessionLaunchStore" },
	),
);
