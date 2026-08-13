import type { PanesStore } from "renderer/lib/panes";
import { type OpenFileOptions, openFileInStore } from "renderer/lib/panes";

/** Opens a file in the supplied panes workspace store. */
export function openFileViewerInPanesStore(
	store: PanesStore,
	options: OpenFileOptions,
): string {
	return openFileInStore(store, options);
}
