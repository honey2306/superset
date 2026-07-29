import { GlobeIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { TbDeviceDesktop } from "react-icons/tb";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { BrowserPaneState, Pane } from "shared/tabs-types";
import { BrowserErrorOverlay } from "../TabView/BrowserPane/components/BrowserErrorOverlay";
import { BrowserToolbar } from "../TabView/BrowserPane/components/BrowserToolbar";
import { BrowserOverflowMenu } from "../TabView/BrowserPane/components/BrowserToolbar/components/BrowserOverflowMenu";
import { DEFAULT_BROWSER_URL } from "../TabView/BrowserPane/constants";
import { usePersistentWebview } from "../TabView/BrowserPane/hooks/usePersistentWebview";

/**
 * Panes-engine browser body.
 *
 * Electron webviews are still registered by the mature v1 webview runtime,
 * which keys its transient DOM/session registry by pane id. This component
 * creates a non-persisted compatibility record for that runtime, then mirrors
 * every browser-state mutation straight back into the panes store. Thus the
 * panes layout remains the persisted source of truth while the webview runtime
 * can be retired independently of the old mosaic/tabs persistence layer.
 */
export function V1PanesBrowserContent({
	paneId,
	tabId,
	browser,
	onBrowserChange,
	onOpenBrowser,
	onOpenDevTools,
	onClose,
}: {
	paneId: string;
	tabId: string;
	browser: BrowserPaneState;
	onBrowserChange: (browser: BrowserPaneState) => void;
	onOpenBrowser: (url: string) => void;
	onOpenDevTools: () => void;
	onClose: () => void;
}) {
	const browserState = useTabsStore((s) => s.panes[paneId]?.browser);
	const initialBrowserRef = useRef(browser);
	const lastMirroredBrowserRef = useRef<BrowserPaneState | undefined>(
		undefined,
	);
	const currentUrl = browserState?.currentUrl ?? browser.currentUrl;
	const pageTitle =
		browserState?.history[browserState.historyIndex]?.title ??
		browser.history[browser.historyIndex]?.title ??
		"";
	const isLoading = browserState?.isLoading ?? browser.isLoading;
	const loadError = browserState?.error ?? browser.error ?? null;
	const isBlankPage = currentUrl === "about:blank";

	// The legacy webview runtime needs a pane-shaped record, but it must never
	// survive as a tabs-store layout entry. Remove it on unmount; browser state
	// has already been mirrored to pane.data and will seed the next mount.
	useEffect(() => {
		useTabsStore.setState((state) => {
			if (state.panes[paneId]) return state;
			const compatibilityPane: Pane = {
				id: paneId,
				tabId,
				type: "webview",
				name: "Browser",
				browser: initialBrowserRef.current,
			};
			return {
				panes: { ...state.panes, [paneId]: compatibilityPane },
			};
		});

		return () => {
			useTabsStore.setState((state) => {
				if (!state.panes[paneId]) return state;
				const { [paneId]: _removed, ...panes } = state.panes;
				return { panes };
			});
		};
	}, [paneId, tabId]);

	useEffect(() => {
		if (!browserState || lastMirroredBrowserRef.current === browserState)
			return;
		lastMirroredBrowserRef.current = browserState;
		onBrowserChange(browserState);
	}, [browserState, onBrowserChange]);

	const {
		containerRef,
		goBack,
		goForward,
		reload,
		navigateTo,
		canGoBack,
		canGoForward,
	} = usePersistentWebview({
		paneId,
		initialUrl: browser.currentUrl || DEFAULT_BROWSER_URL,
		onClosePane: onClose,
		onOpenInBrowser: onOpenBrowser,
	});

	const handleOpenDevTools = useCallback(() => {
		onOpenDevTools();
	}, [onOpenDevTools]);

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex h-9 w-full items-center justify-between border-b border-border px-2 min-w-0">
				<BrowserToolbar
					currentUrl={currentUrl}
					pageTitle={pageTitle}
					isLoading={isLoading}
					canGoBack={canGoBack}
					canGoForward={canGoForward}
					onGoBack={goBack}
					onGoForward={goForward}
					onReload={reload}
					onNavigate={navigateTo}
				/>
				<div className="flex items-center shrink-0">
					<button
						type="button"
						onClick={handleOpenDevTools}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						aria-label="Open DevTools"
					>
						<TbDeviceDesktop className="size-3.5" />
					</button>
					<BrowserOverflowMenu paneId={paneId} hasPage={!isBlankPage} />
				</div>
			</div>
			<div className="relative flex flex-1 h-full min-h-0">
				<div ref={containerRef} className="w-full h-full" style={{ flex: 1 }} />
				{loadError && !isLoading && (
					<BrowserErrorOverlay error={loadError} onRetry={reload} />
				)}
				{isBlankPage && !isLoading && !loadError && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background pointer-events-none">
						<GlobeIcon className="size-10 text-muted-foreground/30" />
						<div className="text-center">
							<p className="text-sm font-medium text-muted-foreground/50">
								Browser
							</p>
							<p className="mt-1 text-xs text-muted-foreground/30">
								Enter a URL above, or instruct an agent to navigate
								<br />
								and use the browser
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
