import type { V1PanesPaneData } from "./types";

/**
 * Pure title derivation for the non-terminal v1 pane kinds.
 *
 * Browser (webview) and devtools pane titles were removed for
 * single-user setup. Only comment remains here.
 */

/** Title for the `comment` pane kind: `@<authorLogin>`, or undefined when
 * the comment payload is absent (registry falls back to `pane.id`). */
export function commentPaneTitle(data: V1PanesPaneData): string | undefined {
	return data.comment ? `@${data.comment.authorLogin}` : undefined;
}
