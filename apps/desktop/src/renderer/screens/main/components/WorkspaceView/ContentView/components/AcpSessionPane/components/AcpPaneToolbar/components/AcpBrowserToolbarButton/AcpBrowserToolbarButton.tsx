import type { AgentBrowserView } from "@superset/session-protocol";
import { Globe2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const EMPTY_VIEW: AgentBrowserView = {
	enabled: false,
	active: false,
	pages: [],
	activePageIndex: null,
};

export function AcpBrowserToolbarButton({
	hostUrl,
	sessionId,
	isOpen,
	onToggle,
}: {
	hostUrl: string;
	sessionId: string;
	isOpen: boolean;
	onToggle: () => void;
}) {
	const [view, setView] = useState<AgentBrowserView>(EMPTY_VIEW);

	useEffect(() => {
		// Keep polling while open: opening the pane may lazily create its first
		// Electron page, and freezing the pre-open snapshot would show Browser 0
		// beside a page selector containing one page.
		let cancelled = false;
		const refresh = async () => {
			try {
				const next = await getHostServiceClientByUrl(
					hostUrl,
				).acpSessions.browserView.query({
					sessionId,
					includeScreenshot: false,
				});
				if (!cancelled) setView(next);
			} catch {
				if (!cancelled) setView(EMPTY_VIEW);
			}
		};
		void refresh();
		const interval = window.setInterval(refresh, 1_500);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [hostUrl, sessionId]);

	// The fixed entry appears when the Agent has actually started its browser.
	// Keep it visible while the companion pane is open, including brief refreshes.
	if ((!view.enabled || !view.active) && !isOpen) return null;

	return (
		<button
			type="button"
			className="acp-browser-trigger"
			data-open={isOpen ? "true" : undefined}
			aria-pressed={isOpen}
			aria-label={isOpen ? "Hide Agent Browser" : "Show Agent Browser"}
			title={isOpen ? "Hide Agent Browser" : "Show Agent Browser"}
			onClick={onToggle}
		>
			<span className="acp-browser-trigger__dot" aria-hidden />
			<Globe2 aria-hidden />
			<span>Browser</span>
			<span className="acp-browser-trigger__count">{view.pages.length}</span>
		</button>
	);
}
