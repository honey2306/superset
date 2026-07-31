import type { TerminalPreset } from "@superset/local-db";
import type { V1PanesPresetOpeners } from "./useV1PanesPresetOpeners";

export type V1PanesPresetBarOpenTarget = "new-tab" | "current-pane";

export function openV1PanesPresetFromBar(
	openers: Pick<V1PanesPresetOpeners, "openPreset">,
	preset: TerminalPreset,
	target: V1PanesPresetBarOpenTarget,
) {
	return openers.openPreset(preset, { target });
}
