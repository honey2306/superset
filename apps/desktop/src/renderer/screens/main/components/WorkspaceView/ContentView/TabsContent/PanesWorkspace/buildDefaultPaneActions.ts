import type { PaneActionConfig } from "@superset/panes";
import type { ReactNode } from "react";
import type { PanesPaneData } from "./types";

export interface DefaultPaneActionsDeps {
	labels: {
		split: string;
		close: string;
	};
	icons: {
		splitRows: ReactNode;
		splitColumns: ReactNode;
		close: ReactNode;
	};
	/** Creates a terminalId for the new split pane. */
	createTerminalId: () => Promise<string>;
}

/**
 * Header pane actions for the panes mount (split + close).
 *
 * Mirrors v2's `useDefaultPaneActions` (split-along-longer-side + close),
 * typed for `PanesPaneData` and terminal-only. `split` mints a fresh
 * `terminalId` via the injected `createTerminalId` and splits a new
 * terminal pane along the active pane's longer side; `close` routes to
 * `ctx.actions.close()` (which triggers the registry's `onBeforeClose`
 * guard). Dependency-injected so the builder is testable without the
 * Electron tRPC client or react-icons at load time.
 */
export function buildDefaultPaneActions(
	deps: DefaultPaneActionsDeps,
): PaneActionConfig<PanesPaneData>[] {
	const { labels, icons, createTerminalId } = deps;
	return [
		{
			key: "split",
			icon: (ctx) =>
				ctx.pane.parentDirection === "horizontal"
					? icons.splitRows
					: icons.splitColumns,
			tooltip: labels.split,
			onClick: async (ctx) => {
				const position =
					ctx.pane.parentDirection === "horizontal" ? "down" : "right";
				const terminalId = await createTerminalId();
				ctx.actions.split(position, {
					kind: "terminal",
					data: { terminalId },
				});
			},
		},
		{
			key: "close",
			icon: icons.close,
			onClick: (ctx) => ctx.actions.close(),
		},
	];
}
