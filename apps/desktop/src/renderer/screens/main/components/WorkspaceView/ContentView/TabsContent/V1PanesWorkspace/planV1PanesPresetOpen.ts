import type { TerminalPreset } from "@superset/local-db/schema/zod";
import type { SplitPosition } from "@superset/panes";
import { AGENT_TYPES, type AgentType } from "@superset/shared/agent-command";

/**
 * Where a preset should open, mirroring v1's `PresetOpenTarget`. M2 only
 * supports the single-command launch shapes (`new-tab` and `active-tab` /
 * split-pane); the multi-command parallel/sequential execution modes are
 * a fidelity follow-up.
 */
export type V1PanesPresetTarget = "new-tab" | "active-tab";

export interface V1PanesPresetOpenOptions {
	target: V1PanesPresetTarget;
	/** Active tab id, or null when there is no active tab (forces addTab). */
	activeTabId?: string | null;
	/** UUID generator for the new terminal id. Injected for deterministic tests. */
	randomUuid?: () => string;
}

export type V1PanesPresetOpenPlan =
	| {
			kind: "addTab";
			terminalId: string;
			agentName: AgentType | undefined;
			initialCommand: string | undefined;
			fallbackCommand: string | undefined;
			initialCwd: string | undefined;
			titleOverride: string | undefined;
	  }
	| {
			kind: "splitPane";
			tabId: string;
			position: SplitPosition;
			terminalId: string;
			agentName: AgentType | undefined;
			initialCommand: string | undefined;
			fallbackCommand: string | undefined;
			initialCwd: string | undefined;
			titleOverride: string | undefined;
	  };

/**
 * Plan how a preset opens into the panes store, without touching the store.
 *
 * Terminal-only and single-pane. Built-in agent presets are identified by
 * name and routed through the formal host `agents.run` path by the opener;
 * their command is retained only as a compatibility fallback. Other presets
 * continue to run their joined commands as the session `initialCommand`.
 *
 * Pure: input → output. The hook (`useV1PanesPresetOpeners`) applies the
 * plan to the panes store; this function is the testable core.
 */
export function planV1PanesPresetOpen(
	preset: Pick<TerminalPreset, "commands" | "cwd" | "name">,
	options: V1PanesPresetOpenOptions,
): V1PanesPresetOpenPlan {
	const {
		target,
		activeTabId = null,
		randomUuid = () => crypto.randomUUID(),
	} = options;
	const terminalId = randomUuid();
	const command =
		preset.commands.length > 0 ? preset.commands.join(" && ") : undefined;
	const normalizedName = preset.name.trim().toLowerCase();
	const agentName = AGENT_TYPES.find((agent) => agent === normalizedName);
	const initialCommand = agentName ? undefined : command;
	const fallbackCommand = agentName ? command : undefined;
	const initialCwd = preset.cwd || undefined;
	const titleOverride = preset.name?.trim() || undefined;

	const base = {
		terminalId,
		agentName,
		initialCommand,
		fallbackCommand,
		initialCwd,
		titleOverride,
	};

	if (target === "active-tab" && activeTabId) {
		return {
			kind: "splitPane",
			tabId: activeTabId,
			position: "right",
			...base,
		};
	}

	return { kind: "addTab", ...base };
}
