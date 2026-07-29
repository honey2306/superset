import { GlobeIcon } from "lucide-react";
import { useCallback } from "react";
import { TbDeviceDesktop } from "react-icons/tb";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BrowserErrorOverlay } from "../TabView/BrowserPane/components/BrowserErrorOverlay";
import { BrowserToolbar } from "../TabView/BrowserPane/components/BrowserToolbar";
import { BrowserOverflowMenu } from "../TabView/BrowserPane/components/BrowserToolbar/components/BrowserOverflowMenu";
import { DEFAULT_BROWSER_URL } from "../TabView/BrowserPane/constants";
import { usePersistentWebview } from "../TabView/BrowserPane/hooks/usePersistentWebview";

/**
 * Panes-engine renderer for the v1 `webview` (browser) pane kind.
 *
 * Wraps the v1 `BrowserPane` body without the mosaic `BasePaneWindow`
 * shell. The panes `<Workspace>` renders the pane header (title / actions
 * / split+close menu). The browser's own navigation toolbar (URL bar,
 * back/forward/reload) is pane content, not a window-chrome control, so
 * it stays here.
 *
 * The webview lifecycle (`usePersistentWebview`) and the browser state
 * reads still come from the v1 global tabs store (`useTabsStore`), since
 * the host browser registration is keyed by `paneId` into that store.
 * When the panes mount becomes the default (M7) the browser state should
 * move into the panes pane `data`; until then the bridge is a thin read.
 */
export function V1PanesBrowserContent({ paneId }: { paneId: string }) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const browserState = pane?.browser;
	const currentUrl = browserState?.currentUrl ?? DEFAULT_BROWSER_URL;
	const pageTitle =
		browserState?.history[browserState.historyIndex]?.title ?? "";
	const isLoading = browserState?.isLoading ?? false;
	const loadError = browserState?.error ?? null;
	const isBlankPage = currentUrl === "about:blank";
	const { mutate: openDevTools } =
		electronTrpc.browser.openDevTools.useMutation();

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
		initialUrl: currentUrl,
	});

	const handleOpenDevTools = useCallback(() => {
		openDevTools({ paneId });
	}, [openDevTools, paneId]);

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
