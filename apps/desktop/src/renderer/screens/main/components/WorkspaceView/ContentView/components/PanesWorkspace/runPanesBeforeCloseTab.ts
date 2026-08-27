import type { PaneRegistry, Tab } from "@superset/panes";

/**
 * Run every pane lifecycle guard before removing a whole tab.
 *
 * Pane close actions already go through the registry one pane at a time. A tab
 * close is different: the panes engine removes the tab directly, so callers
 * must explicitly give each pane a chance to dispose its backend resource (or
 * veto the operation). Keep this sequential so a later guard cannot race an
 * earlier ACP/session close, and stop at the first veto.
 */
export async function runPanesBeforeCloseTab<TData>(
	tab: Tab<TData>,
	registry: PaneRegistry<TData>,
): Promise<boolean> {
	for (const pane of Object.values(tab.panes)) {
		const allowed = await registry[pane.kind]?.onBeforeClose?.(pane);
		if (allowed === false) return false;
	}
	return true;
}
