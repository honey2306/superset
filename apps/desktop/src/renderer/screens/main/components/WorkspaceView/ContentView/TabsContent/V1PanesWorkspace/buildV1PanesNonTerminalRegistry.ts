import type { V1PanesPaneData } from "./types";

/**
 * Pure title derivation for the non-terminal v1 pane kinds.
 *
 * Mirrors v1's pane-name conventions so the panes-engine header shows the
 * same title the mosaic shell did:
 * - comment  → `@<authorLogin>` (v1 `createCommentPane` name)
 * - devtools → "DevTools" (v1 `createDevToolsPane` name; i18n label injected
 *   by the hook so this module stays free of the i18n provider)
 * - webview  → the current page title, else the current URL host, else the
 *   fallback "Browser" label (v1 `BrowserPane` updates `pane.name` to the
 *   page title on navigation)
 *
 * Pure: input → output. Kept separate from `useV1PanesRegistry` (which owns
 * the React `getIcon`/`renderPane`/`contextMenuActions` slices) so the
 * title contract is testable without React / the Electron tRPC client.
 * The hook composes these into each `PaneDefinition.getTitle`.
 */

export interface NonTerminalPaneTitles {
	/** Translated "DevTools" label (v1 static pane name). */
	devtools: string;
	/** Translated "Browser" fallback (v1 `createBrowserPane` name). */
	browser: string;
}

/** Title for the `comment` pane kind: `@<authorLogin>`, or undefined when
 * the comment payload is absent (registry falls back to `pane.id`). */
export function commentPaneTitle(data: V1PanesPaneData): string | undefined {
	return data.comment ? `@${data.comment.authorLogin}` : undefined;
}

/** Title for the `devtools` pane kind: static label. */
export function devtoolsPaneTitle(labels: NonTerminalPaneTitles): string {
	return labels.devtools;
}

/** Title for the `webview` (browser) pane kind: page title → URL host →
 * fallback label. Returns undefined only when no browser state and no
 * fallback is desired (the hook always supplies a fallback). */
export function webviewPaneTitle(
	data: V1PanesPaneData,
	labels: NonTerminalPaneTitles,
): string {
	const browser = data.browser;
	const historyEntry = browser?.history[browser?.historyIndex ?? 0];
	if (historyEntry?.title) return historyEntry.title;
	const url = browser?.currentUrl;
	if (url && url !== "about:blank") {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	}
	return labels.browser;
}
