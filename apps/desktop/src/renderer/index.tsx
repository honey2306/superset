import { pruneExpiredTerminalState } from "./lib/terminal/terminal-buffer-gc";

pruneExpiredTerminalState();

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { BootErrorBoundary } from "./components/BootErrorBoundary";
import {
	cleanupBootErrorHandling,
	initBootErrorHandling,
	isBootErrorReported,
	markBootMounted,
	reportBootError,
} from "./lib/boot-errors";
import { persistentHistory } from "./lib/persistent-hash-history";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { I18nProvider } from "./providers/I18nProvider";
import { NotFound } from "./routes/not-found";
import { routeTree } from "./routeTree.gen";

import "@xterm/xterm/css/xterm.css";
import "./globals.css";
import "./styles/bundled-fonts.css";

const rootElement = document.querySelector("app");
initBootErrorHandling(rootElement);

const router = createRouter({
	routeTree,
	history: persistentHistory,
	defaultPreload: "intent",
	defaultNotFoundComponent: NotFound,
	context: {
		queryClient: electronQueryClient,
	},
});

const handleDeepLink = (path: string) => {
	console.log("[deep-link] Navigating to:", path);
	router.navigate({ to: path });
};
const desktopEvents = window.desktopEvents as
	| typeof window.desktopEvents
	| undefined;
const unsubscribeFromDeepLinks =
	desktopEvents?.onDeepLinkNavigate(handleDeepLink);
if (!desktopEvents) {
	reportBootError(
		"Renderer preload not available (window.desktopEvents missing)",
	);
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		unsubscribeFromDeepLinks?.();
		cleanupBootErrorHandling();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (!rootElement) {
	reportBootError("Missing <app> root element");
} else if (!isBootErrorReported()) {
	ReactDom.createRoot(rootElement).render(
		<BootErrorBoundary
			onError={(error) => reportBootError("Render failed", error)}
		>
			<I18nProvider>
				<RouterProvider router={router} />
			</I18nProvider>
		</BootErrorBoundary>,
	);
	markBootMounted();
}
