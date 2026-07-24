import type { ModifierEvent, Translator } from "../types";

/**
 * Folder click rules are intentionally hardcoded (not settings-driven):
 *
 *   plain         → null   (caller decides — toggle/hint)
 *   shift         → null   (no folder-friendly mapping)
 *   meta / ctrl   → reveal in sidebar
 *   meta+shift    → open in external editor
 *
 * Same rule fires from the file tree, terminal folder links, and any other
 * folder click surface so behavior is consistent.
 */
export type FolderIntent = "reveal" | "external" | null;

export function folderIntentFor(event: ModifierEvent): FolderIntent {
	const meta = event.metaKey || event.ctrlKey;
	if (!meta) return null;
	return event.shiftKey ? "external" : "reveal";
}

export function folderIntentLabel(
	intent: FolderIntent,
	t: Translator,
): string | null {
	if (intent === null) return null;
	return intent === "external"
		? t("clickPolicy.openInEditor")
		: t("clickPolicy.revealInSidebar");
}
