import type { TerminalPreset } from "@superset/shared/desktop-types";
import type { PanesPresetOpeners } from "./usePanesPresetOpeners";

export type PanesPresetBarOpenTarget = "new-tab" | "current-pane";

export function openPanesPresetFromBar(
	openers: Pick<PanesPresetOpeners, "openPreset">,
	preset: TerminalPreset,
	target: PanesPresetBarOpenTarget,
) {
	return openers.openPreset(preset, { target });
}
