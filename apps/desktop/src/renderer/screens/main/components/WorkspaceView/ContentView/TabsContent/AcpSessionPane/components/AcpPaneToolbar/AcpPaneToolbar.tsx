import type { ReactNode } from "react";

interface AcpPaneToolbarProps {
	/**
	 * Session metadata mirrored into `pane.data.acp` (kept in sync by
	 * `onSessionMetadataChange`). Rendering the toolbar from pane data — not
	 * from the live `useAcpSession` — avoids re-mounting on every stream tick.
	 */
	title: string | null | undefined;
	agentLabel: string;
	/** The pane system's own actions (split, close, ...) — placed on the right. */
	paneActions: ReactNode;
}

export function AcpPaneToolbar({
	title,
	agentLabel,
	paneActions,
}: AcpPaneToolbarProps) {
	return (
		<div className="acp-pane__toolbar">
			<span className="acp-pane__chip">
				<span>{agentLabel}</span>
			</span>

			{title && (
				<span
					className="acp-pane__toolbar-title select-text cursor-text"
					title={title}
				>
					{title}
				</span>
			)}

			<span className="acp-pane__toolbar-spacer" />

			{/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag-to-split from triggering on pane action buttons */}
			<div
				className="acp-pane__toolbar-actions"
				onMouseDown={(e) => e.stopPropagation()}
			>
				{paneActions}
			</div>
		</div>
	);
}
