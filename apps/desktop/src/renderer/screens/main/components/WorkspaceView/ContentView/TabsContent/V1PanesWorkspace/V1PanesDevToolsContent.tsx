import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Panes-engine renderer for the v1 `devtools` pane kind.
 *
 * Wraps the v1 `DevToolsPane` behavior without the mosaic `BasePaneWindow`
 * shell: the panes `<Workspace>` already renders the pane header (title /
 * actions / split+close menu), so the pane body only needs the "DevTools
 * opens in a separate window" affordance that opens the Electron devtools
 * for the inspected browser pane. The target pane id comes from the pane
 * data (`devtools.targetPaneId`), mirroring v1's `DevToolsPaneState`.
 *
 * One-shot open on mount mirrors v1's `useEffect`; the explicit "Reopen
 * DevTools" button covers the case where the user closed the devtools
 * window.
 */
export function V1PanesDevToolsContent({
	targetPaneId,
}: {
	targetPaneId: string;
}) {
	const { mutate: openDevTools } =
		electronTrpc.browser.openDevTools.useMutation();

	useEffect(() => {
		openDevTools({ paneId: targetPaneId });
	}, [openDevTools, targetPaneId]);

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
			<div>DevTools open in a separate window.</div>
			<button
				type="button"
				onClick={() => openDevTools({ paneId: targetPaneId })}
				className="rounded border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-accent"
			>
				Reopen DevTools
			</button>
		</div>
	);
}
