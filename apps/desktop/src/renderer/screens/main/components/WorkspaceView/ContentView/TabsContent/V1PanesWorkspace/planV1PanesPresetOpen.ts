import type { TerminalPreset } from "@superset/local-db/schema/zod";
import type { SplitPosition } from "@superset/panes";

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
			initialCommand: string | undefined;
			initialCwd: string | undefined;
			titleOverride: string | undefined;
	  }
	| {
			kind: "splitPane";
			tabId: string;
			position: SplitPosition;
			terminalId: string;
			initialCommand: string | undefined;
			initialCwd: string | undefined;
			titleOverride: string | undefined;
	  };

/**
 * Plan how a preset opens into the panes store, without touching the store.
 *
 * Terminal-only and single-pane: a preset's commands are joined with
 * ` && ` and run as the new terminal's `initialCommand` (host-service
 * `createSession` bakes it into the spawn), the preset's `cwd` becomes the
 * session `initialCwd`, and the preset name becomes the pane
 * `titleOverride`. `new-tab` adds a tab; `active-tab` splits into the
 * active tab (falling back to `addTab` when there is no active tab).
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
		randomUuid = crypto.randomUUID,
	} = options;
	const terminalId = randomUuid();
	const initialCommand =
		preset.commands.length > 0 ? preset.commands.join(" && ") : undefined;
	const initialCwd = preset.cwd || undefined;
	const titleOverride = preset.name?.trim() || undefined;

	const base = {
		terminalId,
		initialCommand,
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
